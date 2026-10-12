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
import { deleteAccount, getAccount, insertAccount, listAccounts } from '@/data/repositories/accounts';
import { getFolderByRole, upsertFolder } from '@/data/repositories/folders';
import {
  countUnread,
  deleteMessage,
  getMessage,
  getThreadIdByMessageIdHeader,
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
  getThread,
  listThreadSummaries,
  recomputeThreadAggregates,
  setThreadArchived as setThreadArchivedRow,
  upsertThread,
} from '@/data/repositories/threads';
import { getAllSettings, setSettings } from '@/data/repositories/settings';
import type { Account, Message, NotificationRule, ThreadSummary } from '@/domain/models';
import { createId, deterministicId } from '@/domain/ids';
import { isSelf, parseAddressList } from '@/domain/mime';
import { buildReplyHeaders, type ReplyMode } from '@/domain/reply-headers';
import { normalizeSubject } from '@/domain/subject';
import {
  computeThreadKey,
  formatMessageId,
  parseMessageIds,
  scopedThreadId,
} from '@/domain/threading';
import type { Notifier } from '@/notifications/notifier';
import { resolveNotification } from '@/notifications/resolve';
import { DEFAULT_SETTINGS, parseAppSettings, serializeAppSettings, type AppSettings } from '@/domain/settings';
import { createDemoProvider, createDemoRules, DEMO_ACCOUNT_ID } from '@/providers/demo/demo-data';
import { MockMailProvider } from '@/providers/mock/mock-mail-provider';
import { ProviderRegistry } from '@/providers/registry';
import type { OutgoingMessage, SendResult } from '@/providers/types';
import { SyncEngine } from '@/sync/sync-engine';

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
}

export interface MailServiceOptions {
  db: Database;
  registry?: ProviderRegistry;
  notifier?: Notifier;
  now?: () => number;
  fetchLimit?: number;
}

export class MailService {
  private readonly db: Database;
  private readonly registry: ProviderRegistry;
  private readonly notifier: Notifier | null;
  private readonly now: () => number;
  private readonly fetchLimit: number;
  private settings: AppSettings = DEFAULT_SETTINGS;

  constructor(options: MailServiceOptions) {
    this.db = options.db;
    this.registry = options.registry ?? new ProviderRegistry();
    this.notifier = options.notifier ?? null;
    this.now = options.now ?? (() => Date.now());
    this.fetchLimit = options.fetchLimit ?? 50;
  }

  /**
   * Load persisted preferences, re-create an in-memory provider for every known
   * account (providers are not persisted), then run a first synchronisation.
   * Does not create any account: that is the onboarding screen's job.
   */
  async initialize(): Promise<void> {
    this.settings = parseAppSettings(await getAllSettings(this.db));

    const accounts = await listAccounts(this.db);
    for (const account of accounts) {
      if (!this.registry.get(account.id)) {
        this.registry.register(account.id, this.createProviderFor(account));
      }
    }

    await this.syncAll();
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

  /** Merge a patch into the persisted preferences and keep the in-memory copy in sync. */
  async updateSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
    const next: AppSettings = { ...this.settings, ...patch };
    await setSettings(this.db, serializeAppSettings(next));
    this.settings = next;
    return next;
  }

  /**
   * Rebuild the in-memory provider for a known account. The demo account gets
   * the deterministic demo mailbox again (idempotent upserts make this safe);
   * real accounts will build an IMAP/SMTP adapter here once Phase 0 lands.
   */
  private createProviderFor(account: Account): MockMailProvider {
    if (account.id === DEMO_ACCOUNT_ID) {
      return createDemoProvider(this.now()).provider;
    }
    return new MockMailProvider({
      emailAddress: account.emailAddress,
      provider: account.provider,
    });
  }

  async listConversations(options?: { includeArchived?: boolean }): Promise<ThreadSummary[]> {
    return listThreadSummaries(this.db, {
      includeArchived: options?.includeArchived ?? false,
    });
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
      const result = await engine.syncAccount(account);
      await this.notifyIncoming(account, result.added);
    }
  }

  /** Fetch a thread and mark it read as a side effect of opening it. */
  async openThread(threadId: string): Promise<Message[]> {
    const messages = await listMessagesByThread(this.db, threadId);
    await this.markThreadRead(threadId, true);
    return messages;
  }

  async getThreadMessages(threadId: string): Promise<Message[]> {
    return listMessagesByThread(this.db, threadId);
  }

  async markThreadRead(threadId: string, isRead: boolean): Promise<void> {
    const messages = await listMessagesByThread(this.db, threadId);
    for (const message of messages) {
      if (message.isRead !== isRead) {
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

    const outgoing: OutgoingMessage = {
      to,
      cc,
      bcc: [],
      subject,
      bodyText: input.body,
      inReplyTo,
      references,
    };

    const result = await provider.send(outgoing);
    if (result.status === 'sent') {
      await this.persistSent(account, outgoing, this.now());
    }
    return result;
  }

  private async persistSent(
    account: Account,
    outgoing: OutgoingMessage,
    now: number,
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

    await upsertMessage(this.db, {
      id: `${account.id}::sent::${deterministicId(messageIdHeader)}`,
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
      hasAttachments: false,
      syncState: 'synced',
    });
    await recomputeThreadAggregates(this.db, threadId);
  }

  private async buildKnownThreadMap(accountId: string): Promise<Map<string, string>> {
    const raw = await getThreadIdByMessageIdHeader(this.db, accountId);
    const known = new Map<string, string>();
    for (const [header, threadId] of raw) {
      for (const id of parseMessageIds(header)) {
        known.set(id, threadId);
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

  /** Wipe all local data for an account (settings screen). */
  async deleteAccountData(accountId: string): Promise<void> {
    this.registry.remove(accountId);
    await deleteAccount(this.db, accountId);
  }
}
