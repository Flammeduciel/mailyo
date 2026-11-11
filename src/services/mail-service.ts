/**
 * Application service — the composition root the UI talks to.
 *
 * It owns no state beyond its injected collaborators: it sequences the
 * repositories, the provider registry, the sync engine and the notifier so a
 * screen never has to know how a conversation is fetched or how a send is
 * persisted. Keeping this layer free of React makes it directly unit-testable
 * against `createMigratedDatabase()` + `MockMailProvider`.
 */

import type { Database } from '@/data/db/database';
import {
  deleteAccount,
  getAccount,
  insertAccount,
  listAccounts,
} from '@/data/repositories/accounts';
import {
  clearDownloadedAttachmentPaths,
  getAttachment,
  listAttachmentsByThread,
  listStarredRemoteAttachments,
  replaceMessageAttachments,
  setAttachmentDownloaded,
  setAttachmentState,
} from '@/data/repositories/attachments';
import {
  deleteDraft as deleteDraftRow,
  getDraft,
  listDrafts as listDraftsRows,
  upsertDraft,
} from '@/data/repositories/drafts';
import { getFolderByRole, upsertFolder } from '@/data/repositories/folders';
import {
  countUnread,
  deleteMessage,
  findMessageIdHeaderByRemoteUid,
  getMessage,
  getCorrespondence,
  getThreadIdByMessageIdHeader,
  listThreadingRows,
  type Correspondence,
  setMessageThreadId,
  listMessagesByThread,
  searchMessages,
  setMessageRead,
  setMessageStarred,
  upsertMessage,
} from '@/data/repositories/messages';
import {
  deleteRule as deleteRuleRow,
  listRules as listRulesRepo,
  setRuleEnabled as setRuleEnabledRow,
  upsertRule,
} from '@/data/repositories/rules';
import {
  deleteEmptyThreads,
  getThread,
  listThreadSummaries,
  recomputeThreadAggregates,
  setThreadArchived as setThreadArchivedRow,
  setThreadPinned as setThreadPinnedRow,
  type ListThreadSummariesOptions,
  upsertThread,
} from '@/data/repositories/threads';
import { getAllSettings, setSetting, setSettings } from '@/data/repositories/settings';
import type {
  Account,
  Attachment,
  Draft,
  Message,
  NotificationRule,
  ProviderId,
  ThreadSummary,
} from '@/domain/models';
import { createId, deterministicId } from '@/domain/ids';
import { isSelf, parseAddressList } from '@/domain/mime';
import { buildReplyHeaders, type ReplyMode } from '@/domain/reply-headers';
import { normalizeSubject } from '@/domain/subject';
import {
  computeThreadKey,
  formatMessageId,
  parseMessageIds,
  scopedThreadId,
  threadKeyOf,
} from '@/domain/threading';
import type { Notifier } from '@/notifications/notifier';
import { resolveNotification } from '@/notifications/resolve';
import {
  DEFAULT_SETTINGS,
  parseAppSettings,
  serializeAppSettings,
  type AppSettings,
} from '@/domain/settings';
import { createDemoProvider, createDemoRules, DEMO_ACCOUNT_ID } from '@/providers/demo/demo-data';
import type {
  MailProvider,
  OutgoingMessage,
  OAuthTokens,
  SendResult,
  TokenStore,
} from '@/providers/types';
import { GmailApiProvider } from '@/providers/gmail/gmail-api-provider';
import { fetchGoogleContacts, type ContactDetails } from '@/providers/gmail/google-contacts';
import { createGmailTokenProvider } from '@/providers/gmail/gmail-tokens';
import {
  attachmentCacheSize,
  clearAttachmentCache,
  readFileAsBase64,
  writeAttachmentToCache,
  type AttachmentWriter,
} from '@/services/attachment-files';
import { ProviderRegistry } from '@/providers/registry';
import { SyncEngine, toLocalAttachments } from '@/sync/sync-engine';

const THREADING_VERSION_KEY = 'threading.version';
const THREADING_VERSION = '2';
// v3 holds Google's letter avatars and contact details; older caches are ignored.
const CONTACT_PHOTOS_KEY = 'contacts.photos.v3';
const CONTACT_PHOTOS_TTL_MS = 12 * 60 * 60 * 1000;

export interface SendMessageInput {
  accountId: string;
  /** Raw recipient field, as typed by the user (comma separated). Ignored for replies. */
  to: string;
  cc?: string;
  subject: string;
  body: string;
  /** Local id of the message being answered; enables reply headers. */
  replyToMessageId?: string;
  mode?: ReplyMode;
  /** Local files picked in the composer. */
  attachments?: PickedAttachment[];
}

export interface SaveDraftInput {
  draftId?: string | null;
  accountId: string;
  to: string;
  cc?: string;
  subject: string;
  body: string;
}

/** A file chosen on the device, before it is read and sent. */
export interface PickedAttachment {
  uri: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
}

export interface ConnectOAuthAccountInput {
  emailAddress: string;
  displayName?: string;
  provider?: ProviderId;
  tokens: OAuthTokens;
}

export interface MailServiceOptions {
  db: Database;
  registry?: ProviderRegistry;
  notifier?: Notifier;
  /** Secure storage for OAuth tokens; omit in tests that do not connect accounts. */
  tokenStore?: TokenStore;
  /** Google OAuth client id, needed to refresh Gmail access tokens. */
  gmailClientId?: string;
  /** HTTP client for provider APIs; defaults to the global `fetch` (tests inject one). */
  fetchImpl?: typeof fetch;
  now?: () => number;
  fetchLimit?: number;
  /** Stores downloaded attachment bytes; defaults to the app cache directory. */
  attachmentWriter?: AttachmentWriter;
  /** Reads a picked local file as base64; defaults to expo-file-system. */
  attachmentReader?: (uri: string) => Promise<string>;
}

export class MailService {
  private readonly db: Database;
  private readonly registry: ProviderRegistry;
  private readonly notifier: Notifier | null;
  private readonly tokenStore: TokenStore | null;
  private readonly gmailClientId: string;
  private readonly fetchImpl: typeof fetch | undefined;
  private readonly now: () => number;
  private readonly fetchLimit: number;
  private readonly attachmentWriter: AttachmentWriter;
  private readonly attachmentReader: (uri: string) => Promise<string>;
  private settings: AppSettings = DEFAULT_SETTINGS;
  private contactPhotos = new Map<string, string>();
  private contactDetails = new Map<string, ContactDetails>();
  private contactPhotosFetchedAt = 0;
  private connectQueue: Promise<unknown> = Promise.resolve();

  constructor(options: MailServiceOptions) {
    this.db = options.db;
    this.registry = options.registry ?? new ProviderRegistry();
    this.notifier = options.notifier ?? null;
    this.tokenStore = options.tokenStore ?? null;
    this.gmailClientId = options.gmailClientId ?? '';
    this.fetchImpl = options.fetchImpl;
    this.now = options.now ?? (() => Date.now());
    this.fetchLimit = options.fetchLimit ?? 50;
    this.attachmentWriter = options.attachmentWriter ?? writeAttachmentToCache;
    this.attachmentReader = options.attachmentReader ?? readFileAsBase64;
  }

  /**
   * Load persisted preferences, re-create an in-memory provider for every known
   * account (providers are not persisted), then run a first synchronisation.
   * Does not create any account: that is the onboarding screen's job.
   */
  async initialize(): Promise<void> {
    await this.loadState();
    await this.syncAll();
  }

  /** Load persisted preferences and register providers, without touching the network. */
  async loadState(): Promise<void> {
    const rawSettings = await getAllSettings(this.db);
    this.settings = parseAppSettings(rawSettings);
    this.loadContactPhotoCache(rawSettings[CONTACT_PHOTOS_KEY]);
    await this.removeDuplicateAccounts();
    if (rawSettings[THREADING_VERSION_KEY] !== THREADING_VERSION) {
      await this.rethreadStoredMail();
      await setSetting(this.db, THREADING_VERSION_KEY, THREADING_VERSION);
    }

    const accounts = await listAccounts(this.db);
    for (const account of accounts) {
      if (this.registry.get(account.id)) {
        continue;
      }
      const provider = this.createProviderFor(account);
      if (provider) {
        this.registry.register(account.id, provider);
      }
    }
  }

  /** Create the built-in demo account, then load and synchronise it. */
  async connectDemo(): Promise<Account> {
    const demo = createDemoProvider(this.now());
    await insertAccount(this.db, demo.account);
    for (const folder of demo.folders) {
      await upsertFolder(this.db, folder);
    }
    for (const rule of createDemoRules(demo.account.id)) {
      await upsertRule(this.db, rule);
    }
    this.registry.register(demo.account.id, demo.provider);
    await this.syncAll();
    return demo.account;
  }

  async listAccounts(): Promise<Account[]> {
    return listAccounts(this.db);
  }

  getSettings(): AppSettings {
    return this.settings;
  }

  /** Cached Google image for an address (real photo or Google's letter avatar). */
  getContactPhoto(emailAddress: string | null | undefined): string | undefined {
    return emailAddress ? this.contactPhotos.get(emailAddress.toLowerCase()) : undefined;
  }

  /** What Google knows about an address, if it is among the user's contacts. */
  getContactDetails(emailAddress: string): ContactDetails | undefined {
    return this.contactDetails.get(emailAddress.toLowerCase());
  }

  /** How much mail was exchanged with an address, across all accounts. */
  async getCorrespondence(emailAddress: string): Promise<Correspondence> {
    return getCorrespondence(this.db, emailAddress);
  }

  private loadContactPhotoCache(raw: string | undefined): void {
    if (!raw) {
      return;
    }
    try {
      const parsed = JSON.parse(raw) as {
        fetchedAt?: number;
        photos?: Record<string, string>;
        details?: Record<string, ContactDetails>;
      };
      this.contactPhotos = new Map(Object.entries(parsed.photos ?? {}));
      this.contactDetails = new Map(Object.entries(parsed.details ?? {}));
      this.contactPhotosFetchedAt = parsed.fetchedAt ?? 0;
    } catch {
      this.contactPhotos = new Map();
      this.contactDetails = new Map();
    }
  }

  /**
   * Refresh contact photos from Google for every Gmail account. Resolves true when
   * the cache changed. Failures (e.g. account authorised before the contacts
   * scopes were added) keep the current cache.
   */
  async refreshContactPhotos(force = false): Promise<boolean> {
    const fresh =
      this.contactPhotos.size > 0 &&
      this.now() - this.contactPhotosFetchedAt < CONTACT_PHOTOS_TTL_MS;
    if (!force && fresh) {
      return false;
    }
    if (!this.tokenStore || !this.gmailClientId) {
      return false;
    }
    const accounts = (await listAccounts(this.db)).filter(
      (account) => account.provider === 'gmail' && account.authType === 'oauth',
    );
    const merged = new Map<string, string>();
    const mergedDetails = new Map<string, ContactDetails>();
    let succeeded = false;
    for (const account of accounts) {
      try {
        const { photos, details } = await fetchGoogleContacts(
          account.emailAddress,
          createGmailTokenProvider({
            accountId: account.id,
            clientId: this.gmailClientId,
            tokenStore: this.tokenStore,
            now: this.now,
            fetchImpl: this.fetchImpl,
          }),
          this.fetchImpl,
        );
        photos.forEach((url, email) => merged.set(email, url));
        details.forEach((detail, email) => mergedDetails.set(email, detail));
        succeeded = true;
      } catch (cause) {
        console.warn(`[MailService] contact photos failed for ${account.emailAddress}`, cause);
      }
    }
    if (!succeeded) {
      return false;
    }
    this.contactPhotos = merged;
    this.contactDetails = mergedDetails;
    this.contactPhotosFetchedAt = this.now();
    await setSetting(
      this.db,
      CONTACT_PHOTOS_KEY,
      JSON.stringify({
        fetchedAt: this.contactPhotosFetchedAt,
        photos: Object.fromEntries(merged),
        details: Object.fromEntries(mergedDetails),
      }),
    );
    return true;
  }

  /** Merge a patch into the persisted preferences and keep the in-memory copy in sync. */
  async updateSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
    const next: AppSettings = { ...this.settings, ...patch };
    await setSettings(this.db, serializeAppSettings(next));
    this.settings = next;
    return next;
  }

  /**
   * Create an account from a successful OAuth authorisation, persist its tokens
   * in the secure store and return it. Real IMAP/SMTP adapters are still Phase 0
   * work, so the account exists and is manageable, but no provider is registered
   * yet and synchronisation simply skips it.
   */
  connectOAuthAccount(input: ConnectOAuthAccountInput): Promise<Account> {
    // Serialised: two overlapping authorisations would both miss the existing
    // account and insert duplicates.
    const run = this.connectQueue.then(() => this.connectOAuthAccountNow(input));
    this.connectQueue = run.catch(() => undefined);
    return run;
  }

  /**
   * Keep a single account per provider + address, preferring one whose tokens
   * are still stored. Duplicates (and their copied mail) are deleted.
   */
  private async removeDuplicateAccounts(): Promise<void> {
    const groups = new Map<string, Account[]>();
    for (const account of await listAccounts(this.db)) {
      const key = `${account.provider}:${account.emailAddress.toLowerCase()}`;
      groups.set(key, [...(groups.get(key) ?? []), account]);
    }
    for (const accounts of groups.values()) {
      if (accounts.length < 2) {
        continue;
      }
      let keep = accounts[0];
      if (this.tokenStore) {
        for (const candidate of accounts) {
          if (await this.tokenStore.load(candidate.id)) {
            keep = candidate;
            break;
          }
        }
      }
      for (const duplicate of accounts) {
        if (duplicate.id !== keep.id) {
          await this.deleteAccountData(duplicate.id);
        }
      }
    }
  }

  /**
   * Recompute every stored message's conversation with the current threading
   * rules, merging conversations that an older version split apart.
   */
  async rethreadStoredMail(): Promise<void> {
    for (const account of await listAccounts(this.db)) {
      const rows = await listThreadingRows(this.db, account.id);
      const known = new Map<string, string>();
      const touched = new Set<string>();
      for (const row of rows) {
        const key = computeThreadKey(row, known);
        const threadId = scopedThreadId(account.id, key);
        for (const id of parseMessageIds(row.messageIdHeader)) {
          known.set(id, key);
        }
        if (threadId === row.threadId) {
          continue;
        }
        if (!(await getThread(this.db, threadId))) {
          const previous = await getThread(this.db, row.threadId);
          await upsertThread(this.db, {
            id: threadId,
            accountId: account.id,
            normalizedSubject: normalizeSubject(row.subject),
            lastMessageAt: 0,
            unreadCount: 0,
            isPinned: previous?.isPinned ?? false,
            isArchived: previous?.isArchived ?? false,
          });
        }
        await setMessageThreadId(this.db, row.id, threadId);
        touched.add(threadId);
      }
      for (const threadId of touched) {
        await recomputeThreadAggregates(this.db, threadId);
      }
      await deleteEmptyThreads(this.db, account.id);
    }
  }

  private async connectOAuthAccountNow(input: ConnectOAuthAccountInput): Promise<Account> {
    const provider = input.provider ?? 'gmail';
    // Re-authorising an address already connected refreshes its tokens instead
    // of creating a duplicate account.
    const existing = (await listAccounts(this.db)).find(
      (candidate) =>
        candidate.provider === provider &&
        candidate.emailAddress.toLowerCase() === input.emailAddress.toLowerCase(),
    );
    if (existing) {
      if (this.tokenStore) {
        await this.tokenStore.save(existing.id, input.tokens);
      }
      if (!this.registry.get(existing.id)) {
        const restored = this.createProviderFor(existing);
        if (restored) {
          this.registry.register(existing.id, restored);
        }
      }
      return existing;
    }

    const account: Account = {
      id: createId('account'),
      provider,
      emailAddress: input.emailAddress,
      displayName: input.displayName ?? input.emailAddress,
      authType: 'oauth',
      syncEnabled: true,
      lastSyncAt: null,
      syncStatus: 'idle',
      createdAt: this.now(),
    };
    await insertAccount(this.db, account);
    if (this.tokenStore) {
      await this.tokenStore.save(account.id, input.tokens);
    }
    const mailProvider = this.createProviderFor(account);
    if (mailProvider) {
      this.registry.register(account.id, mailProvider);
    }
    return account;
  }

  /**
   * Rebuild the in-memory provider for a known account: the demo data set, or
   * the Gmail REST API for OAuth Gmail accounts. Anything else (e.g. password
   * IMAP, still unimplemented) returns `null` so synchronisation skips it.
   */
  private createProviderFor(account: Account): MailProvider | null {
    if (account.id === DEMO_ACCOUNT_ID) {
      return createDemoProvider(this.now()).provider;
    }
    if (
      account.provider === 'gmail' &&
      account.authType === 'oauth' &&
      this.tokenStore &&
      this.gmailClientId
    ) {
      return new GmailApiProvider({
        emailAddress: account.emailAddress,
        getAccessToken: createGmailTokenProvider({
          accountId: account.id,
          clientId: this.gmailClientId,
          tokenStore: this.tokenStore,
          now: this.now,
          fetchImpl: this.fetchImpl,
        }),
        lookupMessageIdHeader: (remoteUid) =>
          findMessageIdHeaderByRemoteUid(this.db, account.id, remoteUid),
        fetchImpl: this.fetchImpl,
      });
    }
    return null;
  }

  async listConversations(options?: ListThreadSummariesOptions): Promise<ThreadSummary[]> {
    return listThreadSummaries(this.db, { includeArchived: false, ...options });
  }

  /**
   * Infinite scroll: fetch one more page of older inbox mail for every account
   * whose provider can page backwards. Resolves `false` once nothing older
   * exists anywhere, so the list can stop asking.
   */
  async loadOlderConversations(pageSize = 30): Promise<boolean> {
    let fetched = 0;
    for (const account of await listAccounts(this.db)) {
      const provider = this.registry.get(account.id);
      if (!provider?.fetchOlderMessages) {
        continue;
      }
      const inbox = await getFolderByRole(this.db, account.id, 'inbox');
      if (!inbox) {
        continue;
      }
      const engine = new SyncEngine({ db: this.db, provider, now: this.now });
      try {
        fetched += await engine.loadOlder(account, inbox, pageSize);
      } catch (error) {
        console.warn(`[MailService] loading older mail failed for ${account.emailAddress}`, error);
      }
    }
    return fetched > 0;
  }

  async setThreadPinned(threadId: string, pinned: boolean): Promise<void> {
    await setThreadPinnedRow(this.db, threadId, pinned);
  }

  /** Star or unstar every message of a thread (the list's "Favori" action). */
  async setThreadStarred(threadId: string, starred: boolean): Promise<void> {
    for (const message of await listMessagesByThread(this.db, threadId)) {
      if (message.isStarred !== starred) {
        await this.toggleStar(message.id, starred);
      }
    }
  }

  async getAccountById(accountId: string): Promise<Account | null> {
    return getAccount(this.db, accountId);
  }

  async unreadCount(): Promise<number> {
    return countUnread(this.db);
  }

  /** Sync every account, present notifications for genuinely new messages. */
  async syncAll(): Promise<void> {
    const accounts = await listAccounts(this.db);
    for (const account of accounts) {
      if (!account.syncEnabled) {
        continue;
      }
      const provider = this.registry.get(account.id);
      if (!provider) {
        continue;
      }
      const engine = new SyncEngine({
        db: this.db,
        provider,
        now: this.now,
        fetchLimit: this.fetchLimit,
      });
      try {
        const result = await engine.syncAccount(account);
        await this.notifyIncoming(account, result.added);
      } catch (error) {
        // One unreachable account (offline, expired token) must not block the
        // others nor app start-up; the engine already flagged it `error`.
        console.warn(`[MailService] sync failed for ${account.emailAddress}`, error);
      }
    }
    if (this.settings.offlineStarredAttachments) {
      await this.downloadStarredAttachments();
    }
  }

  /** Fetch a thread and mark it read as a side effect of opening it. */
  async openThread(threadId: string): Promise<Message[]> {
    const messages = await listMessagesByThread(this.db, threadId);
    await this.markThreadRead(threadId, true);
    return messages;
  }

  /** Attachments of a conversation, grouped by message id. */
  async getThreadAttachments(threadId: string): Promise<Record<string, Attachment[]>> {
    await this.backfillThreadAttachments(threadId);
    const grouped: Record<string, Attachment[]> = {};
    for (const attachment of await listAttachmentsByThread(this.db, threadId)) {
      (grouped[attachment.messageId] ??= []).push(attachment);
    }
    return grouped;
  }

  /**
   * Mails synced before attachments were stored only carry the paperclip flag:
   * fetch their attachment list once, when the conversation is opened.
   */
  private async backfillThreadAttachments(threadId: string): Promise<void> {
    const known = new Set(
      (await listAttachmentsByThread(this.db, threadId)).map((a) => a.messageId),
    );
    for (const message of await listMessagesByThread(this.db, threadId)) {
      if (!message.hasAttachments || known.has(message.id) || message.remoteUid === null) {
        continue;
      }
      const provider = this.registry.get(message.accountId);
      if (!provider?.fetchAttachments) {
        continue;
      }
      try {
        const remote = await provider.fetchAttachments(message.remoteUid);
        await replaceMessageAttachments(
          this.db,
          message.id,
          toLocalAttachments(message.id, remote),
        );
      } catch {
        // Offline or message gone: keep the paperclip only, retry next time.
      }
    }
  }

  /**
   * A URI the UI can display or open. Returns the cached copy when there is
   * one, otherwise downloads the attachment through its provider and caches it.
   */
  async resolveAttachment(attachmentId: string): Promise<Attachment> {
    const attachment = await getAttachment(this.db, attachmentId);
    if (!attachment) {
      throw new Error('Pièce jointe introuvable.');
    }
    if (attachment.localPath) {
      return attachment;
    }
    const message = await getMessage(this.db, attachment.messageId);
    const provider = message ? this.registry.get(message.accountId) : undefined;
    if (!message || message.remoteUid === null || !attachment.remotePartId) {
      throw new Error('Pièce jointe non disponible hors ligne.');
    }
    if (!provider?.downloadAttachment) {
      throw new Error('Ce compte ne permet pas de télécharger les pièces jointes.');
    }
    await setAttachmentState(this.db, attachment.id, 'downloading');
    try {
      const base64 = await provider.downloadAttachment(message.remoteUid, attachment.remotePartId);
      const localPath = await this.attachmentWriter(attachment, base64);
      await setAttachmentDownloaded(this.db, attachment.id, localPath);
      return { ...attachment, localPath, downloadState: 'downloaded' };
    } catch (cause) {
      await setAttachmentState(this.db, attachment.id, 'failed');
      throw cause;
    }
  }

  /** Bytes used by downloaded attachments. */
  attachmentCacheSize(): number {
    try {
      return attachmentCacheSize();
    } catch {
      return 0;
    }
  }

  /** Delete downloaded files and forget their local paths (they are re-fetched on demand). */
  async clearAttachmentCache(): Promise<void> {
    clearAttachmentCache();
    await clearDownloadedAttachmentPaths(this.db);
  }

  /**
   * "Favoris hors ligne": download the attachments of starred mails, within
   * the size limit used for automatic previews (at least 10 Mo).
   */
  async downloadStarredAttachments(): Promise<number> {
    const limit = Math.max(10, this.settings.autoPreviewMaxMb) * 1024 * 1024;
    let downloaded = 0;
    for (const attachment of await listStarredRemoteAttachments(this.db)) {
      if (attachment.sizeBytes > limit) continue;
      try {
        await this.resolveAttachment(attachment.id);
        downloaded += 1;
      } catch {
        // Retried on the next sync.
      }
    }
    return downloaded;
  }

  async getThreadMessages(threadId: string): Promise<Message[]> {
    return listMessagesByThread(this.db, threadId);
  }

  async markThreadRead(threadId: string, isRead: boolean): Promise<void> {
    const messages = await listMessagesByThread(this.db, threadId);
    for (const message of messages) {
      if (message.isRead !== isRead) {
        const provider = this.registry.get(message.accountId);
        if (provider && message.remoteUid !== null) {
          try {
            await provider.setRead(message.remoteUid, isRead);
          } catch {
            // Best-effort; the local flag still reflects the user's intent.
          }
        }
        await setMessageRead(this.db, message.id, isRead);
      }
    }
    await recomputeThreadAggregates(this.db, threadId);
  }

  async toggleStar(messageId: string, isStarred: boolean): Promise<void> {
    const message = await getMessage(this.db, messageId);
    if (!message) {
      return;
    }
    const provider = this.registry.get(message.accountId);
    if (provider && message.remoteUid !== null) {
      try {
        await provider.star(message.remoteUid, isStarred);
      } catch {
        // Best-effort; the local flag still reflects the user's intent.
      }
    }
    await setMessageStarred(this.db, messageId, isStarred);
  }

  async archiveThread(threadId: string): Promise<void> {
    await setThreadArchivedRow(this.db, threadId, true);
  }

  async unarchiveThread(threadId: string): Promise<void> {
    await setThreadArchivedRow(this.db, threadId, false);
  }

  /** Remove every message of a thread locally and on the server. */
  async deleteThread(threadId: string): Promise<void> {
    const messages = await listMessagesByThread(this.db, threadId);
    for (const message of messages) {
      await this.deleteMessageById(message.id);
    }
    await setThreadArchivedRow(this.db, threadId, true);
  }

  async deleteMessageById(messageId: string): Promise<void> {
    const message = await getMessage(this.db, messageId);
    if (!message) {
      return;
    }
    const provider = this.registry.get(message.accountId);
    if (provider && message.remoteUid !== null) {
      try {
        await provider.moveToTrash(message.remoteUid);
      } catch {
        // Best-effort.
      }
    }
    await deleteMessage(this.db, messageId);
    await recomputeThreadAggregates(this.db, message.threadId);
  }

  async search(query: string): Promise<Message[]> {
    const trimmed = query.trim();
    if (trimmed.length === 0) {
      return [];
    }
    return searchMessages(this.db, trimmed);
  }

  /**
   * Send a message. For a reply, recipients and reference headers are derived
   * from the answered message ({@link buildReplyHeaders}); otherwise the raw
   * fields are used. Sent messages are persisted into the local "sent" folder.
   */
  /**
   * Save the compose form as a draft, locally first (never lost), then on the
   * server when the provider supports drafts. Returns the local draft id.
   */
  async saveDraft(input: SaveDraftInput): Promise<string> {
    const existing = input.draftId ? await getDraft(this.db, input.draftId) : null;
    const draft: Draft = {
      id: existing?.id ?? createId('drf'),
      accountId: input.accountId,
      remoteDraftId: existing?.remoteDraftId ?? null,
      to: parseAddressList(input.to),
      cc: input.cc ? parseAddressList(input.cc) : [],
      bcc: [],
      subject: input.subject,
      body: input.body,
      updatedAt: this.now(),
      syncState: 'pending',
    };
    await upsertDraft(this.db, draft);

    const provider = this.registry.get(input.accountId);
    if (provider?.saveDraft) {
      try {
        const remoteDraftId = await provider.saveDraft(draft.remoteDraftId, {
          to: draft.to,
          cc: draft.cc,
          bcc: [],
          subject: draft.subject,
          bodyText: draft.body,
        });
        await upsertDraft(this.db, { ...draft, remoteDraftId, syncState: 'synced' });
      } catch {
        // Offline: the local copy stays "pending" and is pushed on the next save.
      }
    }
    return draft.id;
  }

  async listDrafts(accountId: string): Promise<Draft[]> {
    return listDraftsRows(this.db, accountId);
  }

  async getDraft(draftId: string): Promise<Draft | null> {
    return getDraft(this.db, draftId);
  }

  /** Remove a draft locally and on the server (after sending or discarding it). */
  async discardDraft(draftId: string): Promise<void> {
    const draft = await getDraft(this.db, draftId);
    if (!draft) return;
    await deleteDraftRow(this.db, draftId);
    const provider = this.registry.get(draft.accountId);
    if (draft.remoteDraftId && provider?.deleteDraft) {
      try {
        await provider.deleteDraft(draft.remoteDraftId);
      } catch {
        // Already gone on the server.
      }
    }
  }

  async send(input: SendMessageInput): Promise<SendResult> {
    const account = await getAccount(this.db, input.accountId);
    if (!account) {
      return { status: 'failed', error: 'Compte introuvable' };
    }
    const provider = this.registry.get(account.id);
    if (!provider) {
      return { status: 'failed', error: 'Compte non connecté' };
    }

    let to = parseAddressList(input.to);
    let cc = input.cc ? parseAddressList(input.cc) : [];
    let subject = input.subject.trim();
    let inReplyTo: string | null = null;
    let references: string | null = null;

    const mode = input.mode ?? 'reply';
    if (input.replyToMessageId) {
      const parent = await getMessage(this.db, input.replyToMessageId);
      if (parent) {
        const headers = buildReplyHeaders(parent, account.emailAddress, mode);
        if (mode !== 'forward') {
          to = headers.to;
          cc = headers.cc;
        }
        if (subject.length === 0) {
          subject = headers.subject;
        }
        inReplyTo = headers.inReplyTo;
        references = headers.references;
      }
    }

    const picked = input.attachments ?? [];
    let files: OutgoingMessage['attachments'];
    try {
      files = await Promise.all(
        picked.map(async (file) => ({
          filename: file.filename,
          mimeType: file.mimeType,
          base64: await this.attachmentReader(file.uri),
        })),
      );
    } catch (cause) {
      return {
        status: 'failed',
        error: `Pièce jointe illisible : ${cause instanceof Error ? cause.message : String(cause)}`,
      };
    }

    const outgoing: OutgoingMessage = {
      to,
      cc,
      bcc: [],
      subject,
      bodyText: input.body,
      inReplyTo,
      references,
      attachments: files,
    };

    const result = await provider.send(outgoing);
    if (result.status === 'sent') {
      await this.persistSent(account, outgoing, this.now(), picked);
    }
    return result;
  }

  private async persistSent(
    account: Account,
    outgoing: OutgoingMessage,
    now: number,
    picked: PickedAttachment[] = [],
  ): Promise<void> {
    const sentFolder = await getFolderByRole(this.db, account.id, 'sent');
    if (!sentFolder) {
      return;
    }

    const messageIdHeader = formatMessageId(`${createId('m')}@${account.emailAddress}`);
    const known = await this.buildKnownThreadMap(account.id);
    const threadKey = computeThreadKey(
      {
        messageIdHeader,
        inReplyTo: outgoing.inReplyTo ?? null,
        referencesHeader: outgoing.references ?? null,
        subject: outgoing.subject,
      },
      known,
    );
    const threadId = scopedThreadId(account.id, threadKey);

    if (!(await getThread(this.db, threadId))) {
      await upsertThread(this.db, {
        id: threadId,
        accountId: account.id,
        normalizedSubject: normalizeSubject(outgoing.subject),
        lastMessageAt: now,
        unreadCount: 0,
        isPinned: false,
        isArchived: false,
      });
    }

    const sentId = `${account.id}::sent::${deterministicId(messageIdHeader)}`;
    await upsertMessage(this.db, {
      id: sentId,
      accountId: account.id,
      folderId: sentFolder.id,
      remoteUid: null,
      messageIdHeader,
      inReplyTo: outgoing.inReplyTo ?? null,
      referencesHeader: outgoing.references ?? null,
      threadId,
      senderName: account.displayName,
      senderAddress: account.emailAddress,
      to: outgoing.to,
      cc: outgoing.cc,
      subject: outgoing.subject,
      bodyText: outgoing.bodyText,
      bodyHtmlSanitized: null,
      receivedAt: now,
      isRead: true,
      isStarred: false,
      hasAttachments: picked.length > 0,
      syncState: 'synced',
    });
    if (picked.length > 0) {
      // The local files stay viewable in the conversation right away.
      await replaceMessageAttachments(
        this.db,
        sentId,
        toLocalAttachments(
          sentId,
          picked.map((file) => ({
            filename: file.filename,
            mimeType: file.mimeType,
            sizeBytes: file.sizeBytes,
            remotePartId: null,
            contentUri: file.uri,
          })),
        ),
      );
    }
    await recomputeThreadAggregates(this.db, threadId);
  }

  private async buildKnownThreadMap(accountId: string): Promise<Map<string, string>> {
    const raw = await getThreadIdByMessageIdHeader(this.db, accountId);
    const known = new Map<string, string>();
    for (const [header, threadId] of raw) {
      for (const id of parseMessageIds(header)) {
        known.set(id, threadKeyOf(threadId));
      }
    }
    return known;
  }

  async listRules(): Promise<NotificationRule[]> {
    return listRulesRepo(this.db);
  }

  async saveRule(rule: NotificationRule): Promise<void> {
    await upsertRule(this.db, rule);
  }

  async setRuleEnabled(ruleId: string, enabled: boolean): Promise<void> {
    await setRuleEnabledRow(this.db, ruleId, enabled);
  }

  async deleteRule(ruleId: string): Promise<void> {
    await deleteRuleRow(this.db, ruleId);
  }

  /** Resolve and present notifications for messages that just arrived. */
  async notifyIncoming(account: Account, messages: Message[]): Promise<void> {
    if (!this.notifier || messages.length === 0) {
      return;
    }
    const rules = await listRulesRepo(this.db, account.id);
    for (const message of messages) {
      if (message.isRead || isSelf(message.senderAddress, account.emailAddress)) {
        continue;
      }
      const decision = resolveNotification({
        message,
        rules,
        defaults: {
          soundId: this.settings.defaultSoundId,
          vibrationMode: 'default',
        },
        quietHours: this.settings.quietHours,
        now: new Date(this.now()),
        contentMode: this.settings.contentMode,
      });
      await this.notifier.present(decision);
    }
  }

  async presentTestNotification(soundId: string | null): Promise<void> {
    await this.notifier?.presentTest(soundId);
  }

  async ensureNotificationsConfigured(): Promise<boolean> {
    if (!this.notifier) {
      return false;
    }
    await this.notifier.configure();
    return this.notifier.requestPermission();
  }

  /** Wipe all local data for an account (settings screen), including its tokens. */
  /** The OAuth scopes granted to an account, as stored with its tokens. */
  async getAccountScope(accountId: string): Promise<string | null> {
    const tokens = await this.tokenStore?.load(accountId);
    return tokens?.scope ?? null;
  }

  /**
   * Revoke the account's Google authorisation (best effort: offline must not
   * block signing out), then delete it and its local mail.
   */
  async signOutAccount(accountId: string): Promise<void> {
    const tokens = await this.tokenStore?.load(accountId);
    const token = tokens?.refreshToken ?? tokens?.accessToken;
    if (token) {
      try {
        await (this.fetchImpl ?? fetch)(
          `https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`,
          { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
        );
      } catch (cause) {
        console.warn('[MailService] token revocation failed', cause);
      }
    }
    await this.deleteAccountData(accountId);
  }

  async deleteAccountData(accountId: string): Promise<void> {
    this.registry.remove(accountId);
    await this.tokenStore?.remove(accountId);
    await deleteAccount(this.db, accountId);
  }
}
