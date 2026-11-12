/**
 * Differential synchronisation engine.
 *
 * For each folder it asks the provider for messages newer than the local cursor,
 * normalises them (HTML sanitised, addresses kept), threads them, then writes
 * idempotently to SQLite. A UIDVALIDITY change invalidates the local copy of the
 * folder and forces a full re-fetch, as required by the plan (§5).
 */

import {
  deleteMessagesInFolder,
  getMessage,
  getOldestRemoteUid,
  getThread,
  getThreadIdByMessageIdHeader,
  listFolders,
  recomputeThreadAggregates,
  replaceMessageAttachments,
  updateAccountSyncStatus,
  updateFolderSyncCursor,
  upsertFolder,
  upsertMessage,
  deleteMessage,
  listSentPlaceholders,
  upsertThread,
} from '@/data/repositories';
import type { Database } from '@/data/db/database';
import type { Account, Attachment, Folder, Message, Thread } from '@/domain/models';
import { deterministicId } from '@/domain/ids';
import { findSentEcho, SENT_ECHO_WINDOW_MS } from '@/domain/sent-echo';
import { normalizeSubject } from '@/domain/subject';
import { htmlToText, sanitizeHtml } from '@/domain/sanitize';
import { computeThreadKey, parseMessageIds, scopedThreadId, threadKeyOf } from '@/domain/threading';
import type { MailProvider, RemoteAttachment, RemoteMessage } from '@/providers/types';

/** Provider attachment metadata → local rows with stable ids. */
export function toLocalAttachments(messageId: string, remote: RemoteAttachment[]): Attachment[] {
  return remote.map((attachment, index) => ({
    id: `att_${deterministicId(messageId, String(index), attachment.filename)}`,
    messageId,
    filename: attachment.filename,
    mimeType: attachment.mimeType,
    sizeBytes: attachment.sizeBytes,
    remotePartId: attachment.remotePartId,
    localPath: attachment.contentUri ?? null,
    downloadState: attachment.contentUri ? 'downloaded' : 'remote',
  }));
}

export interface SyncResult {
  added: Message[];
  fetchedCount: number;
  uidValidityReset: boolean;
}

export interface SyncEngineOptions {
  db: Database;
  provider: MailProvider;
  now?: () => number;
  /** Max messages fetched per folder per run (initial sync is bounded). */
  fetchLimit?: number;
  /** Progress of `syncAccount`, from 0 to 1, plus how many messages are stored so far. */
  onProgress?: (progress: SyncProgress) => void;
}

export interface SyncProgress {
  ratio: number;
  stored: number;
}

/** Share of a folder's progress spent downloading (the rest is storing). */
const FETCH_WEIGHT = 0.8;

export class SyncEngine {
  private readonly db: Database;
  private readonly provider: MailProvider;
  private readonly now: () => number;
  private readonly fetchLimit: number;
  private readonly onProgress?: (progress: SyncProgress) => void;
  private stored = 0;

  constructor(options: SyncEngineOptions) {
    this.db = options.db;
    this.provider = options.provider;
    this.now = options.now ?? (() => Date.now());
    this.fetchLimit = options.fetchLimit ?? 50;
    this.onProgress = options.onProgress;
  }

  /** Synchronise every folder of an account that is enabled for sync. */
  async syncAccount(account: Account): Promise<SyncResult> {
    if (!account.syncEnabled) {
      return { added: [], fetchedCount: 0, uidValidityReset: false };
    }

    await updateAccountSyncStatus(this.db, account.id, 'syncing', account.lastSyncAt);

    const result: SyncResult = { added: [], fetchedCount: 0, uidValidityReset: false };

    try {
      const folders = await this.ensureFolders(account);
      this.stored = 0;
      for (const [index, folder] of folders.entries()) {
        const report = (share: number) =>
          this.onProgress?.({
            ratio: Math.min(1, (index + share) / Math.max(1, folders.length)),
            stored: this.stored,
          });
        const folderResult = await this.syncFolder(account, folder, report);
        result.added.push(...folderResult.added);
        result.fetchedCount += folderResult.fetchedCount;
        result.uidValidityReset = result.uidValidityReset || folderResult.uidValidityReset;
      }
      await updateAccountSyncStatus(this.db, account.id, 'idle', this.now());
      this.onProgress?.({ ratio: 1, stored: this.stored });
    } catch (error) {
      await updateAccountSyncStatus(this.db, account.id, 'error', account.lastSyncAt);
      throw error;
    }

    return result;
  }

  /** Fetch the remote folders and persist them locally (idempotent). */
  async ensureFolders(account: Account): Promise<Folder[]> {
    const remoteFolders = await this.provider.listFolders();
    const existing = await listFolders(this.db, account.id);
    const cursorByRemoteId = new Map(existing.map((folder) => [folder.remoteFolderId, folder]));

    const folders: Folder[] = [];
    for (const remote of remoteFolders) {
      const previous = cursorByRemoteId.get(remote.remoteFolderId);
      const folder: Folder = {
        id: deterministicId(account.id, remote.remoteFolderId),
        accountId: account.id,
        remoteFolderId: remote.remoteFolderId,
        name: remote.name,
        role: remote.role,
        // Preserve the sync cursor across runs; only a first sighting is null.
        lastUidValidity: previous?.lastUidValidity ?? null,
        lastSyncedUid: previous?.lastSyncedUid ?? null,
      };
      await upsertFolder(this.db, folder);
      folders.push(folder);
    }
    return folders;
  }

  async syncFolder(
    account: Account,
    folder: Folder,
    report?: (share: number) => void,
  ): Promise<SyncResult> {
    report?.(0);
    const fetch = await this.provider.fetchMessages({
      folderRemoteId: folder.remoteFolderId,
      knownUidValidity: folder.lastUidValidity,
      lastSyncedUid: folder.lastSyncedUid,
      limit: this.fetchLimit,
      onProgress: (fetched, total) => report?.(FETCH_WEIGHT * (total > 0 ? fetched / total : 1)),
    });
    report?.(FETCH_WEIGHT);

    const uidValidityReset =
      folder.lastUidValidity !== null && folder.lastUidValidity !== fetch.uidValidity;

    if (uidValidityReset) {
      await deleteMessagesInFolder(this.db, folder.id);
    }

    const knownThreads = await this.buildKnownThreadMap(account.id);
    const added: Message[] = [];
    let maxUid = folder.lastSyncedUid ?? -1;

    for (const [index, remote] of fetch.messages.entries()) {
      const persisted = await this.persistMessage(account, folder, remote, knownThreads);
      if (persisted.isNew) {
        added.push(persisted.message);
      }
      maxUid = Math.max(maxUid, remote.remoteUid);
      this.stored += 1;
      report?.(FETCH_WEIGHT + (1 - FETCH_WEIGHT) * ((index + 1) / fetch.messages.length));
    }

    await updateFolderSyncCursor(this.db, folder.id, fetch.uidValidity, maxUid);

    return { added, fetchedCount: fetch.messages.length, uidValidityReset };
  }

  /**
   * Load one page of mail older than what is stored for this folder (infinite
   * scroll). Returns how many messages were fetched: 0 means history is
   * exhausted or the provider cannot page backwards. Never notifies.
   */
  async loadOlder(account: Account, folder: Folder, limit: number): Promise<number> {
    if (!this.provider.fetchOlderMessages) {
      return 0;
    }
    const oldest = await getOldestRemoteUid(this.db, folder.id);
    if (oldest === null) {
      return 0;
    }
    const remotes = await this.provider.fetchOlderMessages({
      folderRemoteId: folder.remoteFolderId,
      beforeUid: oldest,
      limit,
    });
    const knownThreads = await this.buildKnownThreadMap(account.id);
    // Oldest first, so replies thread onto parents fetched in the same page.
    for (const remote of [...remotes].sort((a, b) => a.remoteUid - b.remoteUid)) {
      await this.persistMessage(account, folder, remote, knownThreads);
    }
    return remotes.length;
  }

  /** Store mail fetched outside the regular sync (e.g. restored from the trash). Never notifies. */
  async storeMessages(account: Account, folder: Folder, remotes: RemoteMessage[]): Promise<void> {
    const knownThreads = await this.buildKnownThreadMap(account.id);
    for (const remote of [...remotes].sort((a, b) => a.remoteUid - b.remoteUid)) {
      await this.persistMessage(account, folder, remote, knownThreads);
    }
  }

  private async persistMessage(
    account: Account,
    folder: Folder,
    remote: RemoteMessage,
    knownThreads: Map<string, string>,
  ): Promise<{ message: Message; isNew: boolean }> {
    const messageIdHeader = remote.messageIdHeader;
    const threadKey = computeThreadKey(
      {
        messageIdHeader,
        inReplyTo: remote.inReplyTo,
        referencesHeader: remote.referencesHeader,
        subject: remote.subject,
      },
      knownThreads,
    );
    const threadId = scopedThreadId(account.id, threadKey);

    const existingThread = await getThread(this.db, threadId);
    if (!existingThread) {
      const thread: Thread = {
        id: threadId,
        accountId: account.id,
        normalizedSubject: normalizeSubject(remote.subject),
        lastMessageAt: remote.receivedAt,
        unreadCount: 0,
        isPinned: false,
        isArchived: false,
      };
      await upsertThread(this.db, thread);
    }

    const html = remote.bodyHtml ? sanitizeHtml(remote.bodyHtml) : null;
    const bodyText = remote.bodyText.trim().length > 0 ? remote.bodyText : htmlToText(html ?? '');

    const message: Message = {
      id: this.messageId(account.id, folder.id, remote),
      accountId: account.id,
      folderId: folder.id,
      remoteUid: remote.remoteUid,
      messageIdHeader,
      inReplyTo: remote.inReplyTo,
      referencesHeader: remote.referencesHeader,
      threadId,
      senderName: remote.senderName,
      senderAddress: remote.senderAddress,
      to: remote.to,
      cc: remote.cc,
      subject: remote.subject,
      bodyText,
      bodyHtmlSanitized: html,
      receivedAt: remote.receivedAt,
      isRead: remote.isRead,
      isStarred: remote.isStarred,
      hasAttachments: remote.hasAttachments || (remote.attachments?.length ?? 0) > 0,
      syncState: 'synced',
      category: remote.category ?? null,
      listUnsubscribe: remote.listUnsubscribe ?? null,
      listUnsubscribePost: remote.listUnsubscribePost ?? null,
    };

    // Our own sent mail coming back from the server replaces the local copy.
    let replaced: Message | null = null;
    if (remote.senderAddress.toLowerCase() === account.emailAddress.toLowerCase()) {
      const placeholders = await listSentPlaceholders(
        this.db,
        account.id,
        account.emailAddress,
        remote.receivedAt,
        SENT_ECHO_WINDOW_MS,
      );
      const index = findSentEcho(placeholders, { ...remote, bodyText });
      const echo = index >= 0 ? placeholders[index] : null;
      if (echo && echo.id !== message.id) {
        replaced = await getMessage(this.db, echo.id);
        await deleteMessage(this.db, echo.id);
        if (echo.threadId !== threadId) await recomputeThreadAggregates(this.db, echo.threadId);
      }
    }

    const isNew = replaced === null && (await getMessage(this.db, message.id)) === null;
    await upsertMessage(this.db, message);
    if (remote.attachments) {
      const attachments = toLocalAttachments(message.id, remote.attachments);
      await replaceMessageAttachments(this.db, message.id, attachments);
    }
    await recomputeThreadAggregates(this.db, threadId);

    // Make the freshly stored id resolvable for the rest of this batch.
    for (const id of parseMessageIds(messageIdHeader)) {
      knownThreads.set(id, threadKey);
    }

    return { message, isNew };
  }

  /**
   * Stable local identity: the server Message-ID when present (so re-fetching or
   * seeing the same mail in another folder updates one row), otherwise the
   * folder + UID pair.
   */
  private messageId(accountId: string, folderId: string, remote: RemoteMessage): string {
    const id = parseMessageIds(remote.messageIdHeader)[0];
    if (id) {
      return localMessageId(accountId, id);
    }
    return `msg_${deterministicId(accountId, folderId, String(remote.remoteUid))}`;
  }

  private async buildKnownThreadMap(accountId: string): Promise<Map<string, string>> {
    const stored = await getThreadIdByMessageIdHeader(this.db, accountId);
    const normalized = new Map<string, string>();
    // Values must be bare keys: `persistMessage` scopes whatever key it gets.
    for (const [header, threadId] of stored) {
      for (const id of parseMessageIds(header)) {
        normalized.set(id, threadKeyOf(threadId));
      }
    }
    return normalized;
  }
}

/** Local row id of a mail known by its Message-ID (shared by sync and sent copies). */
export function localMessageId(accountId: string, messageId: string): string {
  return `msg_${deterministicId(accountId, messageId)}`;
}
