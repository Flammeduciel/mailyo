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
  getThread,
  getThreadIdByMessageIdHeader,
  recomputeThreadAggregates,
  updateAccountSyncStatus,
  updateFolderSyncCursor,
  upsertFolder,
  upsertMessage,
  upsertThread,
} from '@/data/repositories';
import type { Database } from '@/data/db/database';
import type { Account, Folder, Message, Thread } from '@/domain/models';
import { deterministicId } from '@/domain/ids';
import { normalizeSubject } from '@/domain/subject';
import { htmlToText, sanitizeHtml } from '@/domain/sanitize';
import { computeThreadKey, parseMessageIds, scopedThreadId } from '@/domain/threading';
import type { MailProvider, RemoteMessage } from '@/providers/types';

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
}

export class SyncEngine {
  private readonly db: Database;
  private readonly provider: MailProvider;
  private readonly now: () => number;
  private readonly fetchLimit: number;

  constructor(options: SyncEngineOptions) {
    this.db = options.db;
    this.provider = options.provider;
    this.now = options.now ?? (() => Date.now());
    this.fetchLimit = options.fetchLimit ?? 50;
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
      for (const folder of folders) {
        const folderResult = await this.syncFolder(account, folder);
        result.added.push(...folderResult.added);
        result.fetchedCount += folderResult.fetchedCount;
        result.uidValidityReset = result.uidValidityReset || folderResult.uidValidityReset;
      }
      await updateAccountSyncStatus(this.db, account.id, 'idle', this.now());
    } catch (error) {
      await updateAccountSyncStatus(this.db, account.id, 'error', account.lastSyncAt);
      throw error;
    }

    return result;
  }

  /** Fetch the remote folders and persist them locally (idempotent). */
  async ensureFolders(account: Account): Promise<Folder[]> {
    const remoteFolders = await this.provider.listFolders();
    const folders: Folder[] = [];
    for (const remote of remoteFolders) {
      const folder: Folder = {
        id: deterministicId(account.id, remote.remoteFolderId),
        accountId: account.id,
        remoteFolderId: remote.remoteFolderId,
        name: remote.name,
        role: remote.role,
        lastUidValidity: null,
        lastSyncedUid: null,
      };
      await upsertFolder(this.db, folder);
      folders.push(folder);
    }
    return folders;
  }

  async syncFolder(account: Account, folder: Folder): Promise<SyncResult> {
    const fetch = await this.provider.fetchMessages({
      folderRemoteId: folder.remoteFolderId,
      knownUidValidity: folder.lastUidValidity,
      lastSyncedUid: folder.lastSyncedUid,
      limit: this.fetchLimit,
    });

    const uidValidityReset =
      folder.lastUidValidity !== null && folder.lastUidValidity !== fetch.uidValidity;

    if (uidValidityReset) {
      await deleteMessagesInFolder(this.db, folder.id);
    }

    const knownThreads = await this.buildKnownThreadMap(account.id);
    const added: Message[] = [];
    let maxUid = folder.lastSyncedUid ?? -1;

    for (const remote of fetch.messages) {
      const message = await this.persistMessage(account, folder, remote, knownThreads);
      added.push(message);
      maxUid = Math.max(maxUid, remote.remoteUid);
    }

    await updateFolderSyncCursor(this.db, folder.id, fetch.uidValidity, maxUid);

    return { added, fetchedCount: fetch.messages.length, uidValidityReset };
  }

  private async persistMessage(
    account: Account,
    folder: Folder,
    remote: RemoteMessage,
    knownThreads: Map<string, string>,
  ): Promise<Message> {
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
      hasAttachments: remote.hasAttachments,
      syncState: 'synced',
    };

    await upsertMessage(this.db, message);
    await recomputeThreadAggregates(this.db, threadId);

    // Make the freshly stored id resolvable for the rest of this batch.
    for (const id of parseMessageIds(messageIdHeader)) {
      knownThreads.set(id, threadKey);
    }

    return message;
  }

  /**
   * Stable local identity: the server Message-ID when present (so re-fetching or
   * seeing the same mail in another folder updates one row), otherwise the
   * folder + UID pair.
   */
  private messageId(accountId: string, folderId: string, remote: RemoteMessage): string {
    const id = parseMessageIds(remote.messageIdHeader)[0];
    if (id) {
      return `msg_${deterministicId(accountId, id)}`;
    }
    return `msg_${deterministicId(accountId, folderId, String(remote.remoteUid))}`;
  }

  private async buildKnownThreadMap(accountId: string): Promise<Map<string, string>> {
    const stored = await getThreadIdByMessageIdHeader(this.db, accountId);
    const normalized = new Map<string, string>();
    for (const [header, threadId] of stored) {
      for (const id of parseMessageIds(header)) {
        normalized.set(id, threadId);
      }
    }
    return normalized;
  }
}
