import type { Database } from '@/data/db/database';
import { upsertMessage } from '@/data/repositories/messages';
import {
  getThread,
  listThreadSummaries,
  recomputeThreadAggregates,
  setThreadArchived,
  setThreadPinned,
  upsertThread,
} from '@/data/repositories/threads';
import { createMigratedDatabase } from '@/data/repositories/test-utils';
import type { Message, Thread } from '@/domain/models';

function thread(overrides: Partial<Thread> = {}): Thread {
  return {
    id: 'thr_1',
    accountId: 'acc_1',
    normalizedSubject: 'hello',
    lastMessageAt: 1_000,
    unreadCount: 0,
    isPinned: false,
    isArchived: false,
    ...overrides,
  };
}

function message(overrides: Partial<Message> = {}): Message {
  return {
    id: 'msg_1',
    accountId: 'acc_1',
    folderId: 'fold_1',
    remoteUid: 1,
    messageIdHeader: '<m1@example.com>',
    inReplyTo: null,
    referencesHeader: null,
    threadId: 'thr_1',
    senderName: 'Bob',
    senderAddress: 'bob@example.com',
    to: [],
    cc: [],
    subject: 'Hello',
    bodyText: 'First',
    bodyHtmlSanitized: null,
    receivedAt: 1_000,
    isRead: true,
    isStarred: false,
    hasAttachments: false,
    syncState: 'synced',
    ...overrides,
  };
}

describe('threads repository', () => {
  let db: Database;

  beforeEach(async () => {
    db = await createMigratedDatabase();
  });

  it('round-trips threads with boolean flags', async () => {
    await upsertThread(db, thread({ isPinned: true, isArchived: true }));
    expect(await getThread(db, 'thr_1')).toEqual(thread({ isPinned: true, isArchived: true }));
  });

  it('upserts idempotently', async () => {
    await upsertThread(db, thread());
    await upsertThread(db, thread({ unreadCount: 3 }));

    const summaries = await listThreadSummaries(db);
    expect(summaries).toHaveLength(1);
    expect(summaries[0].unreadCount).toBe(3);
  });

  it('toggles pinned and archived flags', async () => {
    await upsertThread(db, thread());
    await setThreadPinned(db, 'thr_1', true);
    await setThreadArchived(db, 'thr_1', true);

    const loaded = await getThread(db, 'thr_1');
    expect(loaded?.isPinned).toBe(true);
    expect(loaded?.isArchived).toBe(true);
  });

  it('builds summaries with lastMessage, count and attachment flag, newest first', async () => {
    await upsertThread(db, thread({ id: 'thr_old', lastMessageAt: 1_000 }));
    await upsertThread(db, thread({ id: 'thr_new', lastMessageAt: 3_000 }));
    await upsertMessage(
      db,
      message({
        id: 'm_old',
        threadId: 'thr_old',
        remoteUid: 1,
        receivedAt: 1_000,
        subject: 'Old',
        senderName: 'Old Bob',
        hasAttachments: false,
      }),
    );
    await upsertMessage(
      db,
      message({
        id: 'm_new_1',
        threadId: 'thr_new',
        remoteUid: 2,
        receivedAt: 2_000,
        subject: 'First',
        bodyText: 'first body',
      }),
    );
    await upsertMessage(
      db,
      message({
        id: 'm_new_2',
        threadId: 'thr_new',
        remoteUid: 3,
        receivedAt: 3_000,
        subject: 'Latest',
        bodyText: 'latest body',
        senderName: 'Carol',
        senderAddress: 'carol@example.com',
        hasAttachments: true,
      }),
    );

    const summaries = await listThreadSummaries(db);

    expect(summaries.map((s) => s.id)).toEqual(['thr_new', 'thr_old']);
    const newest = summaries[0];
    expect(newest.messageCount).toBe(2);
    expect(newest.hasAttachments).toBe(true);
    expect(newest.lastMessage).toEqual({
      senderName: 'Carol',
      senderAddress: 'carol@example.com',
      subject: 'Latest',
      bodyText: 'latest body',
      receivedAt: 3_000,
    });
  });

  it('excludes archived threads unless requested', async () => {
    await upsertThread(db, thread({ id: 'thr_1' }));
    await upsertThread(db, thread({ id: 'thr_arch', isArchived: true }));

    expect((await listThreadSummaries(db)).map((s) => s.id)).toEqual(['thr_1']);
    expect(
      (await listThreadSummaries(db, { includeArchived: true })).map((s) => s.id).sort(),
    ).toEqual(['thr_1', 'thr_arch']);
  });

  it('filters summaries by account', async () => {
    await upsertThread(db, thread({ id: 'thr_1', accountId: 'acc_1' }));
    await upsertThread(db, thread({ id: 'thr_2', accountId: 'acc_2' }));

    expect((await listThreadSummaries(db, { accountId: 'acc_2' })).map((s) => s.id)).toEqual([
      'thr_2',
    ]);
  });

  it('recomputes unread count and last message time', async () => {
    await upsertThread(db, thread({ lastMessageAt: 0, unreadCount: 0 }));
    await upsertMessage(db, message({ id: 'm1', remoteUid: 1, receivedAt: 1_000, isRead: true }));
    await upsertMessage(db, message({ id: 'm2', remoteUid: 2, receivedAt: 5_000, isRead: false }));
    await upsertMessage(db, message({ id: 'm3', remoteUid: 3, receivedAt: 3_000, isRead: false }));

    await recomputeThreadAggregates(db, 'thr_1');

    const loaded = await getThread(db, 'thr_1');
    expect(loaded?.unreadCount).toBe(2);
    expect(loaded?.lastMessageAt).toBe(5_000);
  });

  it('limits summaries when a limit is given', async () => {
    await upsertThread(db, thread({ id: 'thr_1', lastMessageAt: 1 }));
    await upsertThread(db, thread({ id: 'thr_2', lastMessageAt: 2 }));

    expect((await listThreadSummaries(db, { limit: 1 })).map((s) => s.id)).toEqual(['thr_2']);
  });
});
