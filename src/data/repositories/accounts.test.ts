import type { Database } from '@/data/db/database';
import {
  deleteAccount,
  getAccount,
  insertAccount,
  listAccounts,
  setAccountSyncEnabled,
  updateAccountSyncStatus,
} from '@/data/repositories/accounts';
import { upsertDraft } from '@/data/repositories/drafts';
import { upsertFolder } from '@/data/repositories/folders';
import { upsertMessage } from '@/data/repositories/messages';
import { recordEvent } from '@/data/repositories/notification-events';
import { enqueueOperation } from '@/data/repositories/pending-operations';
import { insertRule } from '@/data/repositories/rules';
import { createMigratedDatabase } from '@/data/repositories/test-utils';
import { upsertThread } from '@/data/repositories/threads';
import type { Account, Draft, Message, PendingOperation } from '@/domain/models';

function account(overrides: Partial<Account> = {}): Account {
  return {
    id: 'acc_1',
    provider: 'imap',
    emailAddress: 'a@example.com',
    displayName: 'Alice',
    authType: 'password',
    syncEnabled: true,
    lastSyncAt: null,
    syncStatus: 'idle',
    createdAt: 1_000,
    ...overrides,
  };
}

function message(): Message {
  return {
    id: 'msg_1',
    accountId: 'acc_1',
    folderId: 'fold_1',
    remoteUid: 10,
    messageIdHeader: '<m1@example.com>',
    inReplyTo: null,
    referencesHeader: null,
    threadId: 'thr_1',
    senderName: 'Bob',
    senderAddress: 'bob@example.com',
    to: [],
    cc: [],
    subject: 'Hi',
    bodyText: 'Body',
    bodyHtmlSanitized: null,
    receivedAt: 2_000,
    isRead: false,
    isStarred: false,
    hasAttachments: false,
    syncState: 'synced',
  };
}

describe('accounts repository', () => {
  let db: Database;

  beforeEach(async () => {
    db = await createMigratedDatabase();
  });

  it('inserts and reads an account preserving booleans and dates', async () => {
    await insertAccount(db, account({ lastSyncAt: 5_000, syncEnabled: false }));

    const loaded = await getAccount(db, 'acc_1');
    expect(loaded).toEqual(account({ lastSyncAt: 5_000, syncEnabled: false }));
  });

  it('returns null for a missing account', async () => {
    expect(await getAccount(db, 'nope')).toBeNull();
  });

  it('lists accounts ordered by creation time', async () => {
    await insertAccount(db, account({ id: 'b', createdAt: 200 }));
    await insertAccount(db, account({ id: 'a', createdAt: 100 }));

    expect((await listAccounts(db)).map((a) => a.id)).toEqual(['a', 'b']);
  });

  it('updates sync status and enabled flag with boolean round-trip', async () => {
    await insertAccount(db, account());
    await updateAccountSyncStatus(db, 'acc_1', 'error', 9_999);
    await setAccountSyncEnabled(db, 'acc_1', false);

    const loaded = await getAccount(db, 'acc_1');
    expect(loaded?.syncStatus).toBe('error');
    expect(loaded?.lastSyncAt).toBe(9_999);
    expect(loaded?.syncEnabled).toBe(false);
  });

  it('cascades delete to all owned rows', async () => {
    await insertAccount(db, account());
    await upsertFolder(db, {
      id: 'fold_1',
      accountId: 'acc_1',
      remoteFolderId: 'INBOX',
      name: 'Inbox',
      role: 'inbox',
      lastUidValidity: null,
      lastSyncedUid: null,
    });
    await upsertThread(db, {
      id: 'thr_1',
      accountId: 'acc_1',
      normalizedSubject: 'hi',
      lastMessageAt: 2_000,
      unreadCount: 1,
      isPinned: false,
      isArchived: false,
    });
    await upsertMessage(db, message());
    await db.runAsync(
      `INSERT INTO attachments (id, message_id, filename, mime_type, size_bytes)
       VALUES ('att_1', 'msg_1', 'f.pdf', 'application/pdf', 12)`,
    );
    await insertRule(db, {
      id: 'rule_1',
      accountId: 'acc_1',
      matchType: 'sender',
      matchValue: 'bob@example.com',
      action: 'notify',
      soundId: null,
      vibrationMode: 'default',
      enabled: true,
      createdAt: 1,
    });
    const draft: Draft = {
      id: 'draft_1',
      accountId: 'acc_1',
      remoteDraftId: null,
      to: [],
      cc: [],
      bcc: [],
      subject: '',
      body: '',
      updatedAt: 1,
      syncState: 'pending',
    };
    await upsertDraft(db, draft);
    const op: PendingOperation = {
      id: 'op_1',
      accountId: 'acc_1',
      messageId: 'msg_1',
      operationType: 'markRead',
      payload: {},
      createdAt: 1,
      retryCount: 0,
      status: 'pending',
      lastError: null,
    };
    await enqueueOperation(db, op);
    await recordEvent(db, {
      id: 'evt_1',
      messageId: 'msg_1',
      ruleId: 'rule_1',
      notifiedAt: 1,
      result: 'notified',
      reason: '',
    });

    await deleteAccount(db, 'acc_1');

    const counts = await db.getFirstAsync<{
      accounts: number;
      folders: number;
      threads: number;
      messages: number;
      attachments: number;
      rules: number;
      drafts: number;
      ops: number;
      events: number;
    }>(
      `SELECT
         (SELECT COUNT(*) FROM accounts) AS accounts,
         (SELECT COUNT(*) FROM folders) AS folders,
         (SELECT COUNT(*) FROM threads) AS threads,
         (SELECT COUNT(*) FROM messages) AS messages,
         (SELECT COUNT(*) FROM attachments) AS attachments,
         (SELECT COUNT(*) FROM notification_rules) AS rules,
         (SELECT COUNT(*) FROM drafts) AS drafts,
         (SELECT COUNT(*) FROM pending_operations) AS ops,
         (SELECT COUNT(*) FROM notification_events) AS events`,
    );
    expect(counts).toEqual({
      accounts: 0,
      folders: 0,
      threads: 0,
      messages: 0,
      attachments: 0,
      rules: 0,
      drafts: 0,
      ops: 0,
      events: 0,
    });
  });
});
