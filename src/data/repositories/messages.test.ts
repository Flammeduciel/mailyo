import type { Database } from '@/data/db/database';
import {
  countUnread,
  deleteMessage,
  findMessageByRemoteUid,
  getMessage,
  getThreadIdByMessageIdHeader,
  listMessages,
  listMessagesByThread,
  searchMessages,
  setMessageRead,
  setMessageStarred,
  setThreadRead,
  upsertMessage,
} from '@/data/repositories/messages';
import { createMigratedDatabase } from '@/data/repositories/test-utils';
import type { Message } from '@/domain/models';

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
    to: [{ name: 'Alice', address: 'alice@example.com' }],
    cc: [{ name: 'Carol', address: 'carol@example.com' }],
    subject: 'Hello World',
    bodyText: 'Body text',
    bodyHtmlSanitized: null,
    receivedAt: 1_000,
    isRead: false,
    isStarred: false,
    hasAttachments: false,
    syncState: 'synced',
    ...overrides,
  };
}

describe('messages repository', () => {
  let db: Database;

  beforeEach(async () => {
    db = await createMigratedDatabase();
  });

  it('round-trips arrays, booleans and dates', async () => {
    await upsertMessage(db, message({ isRead: true, isStarred: true, hasAttachments: true }));

    expect(await getMessage(db, 'msg_1')).toEqual(
      message({ isRead: true, isStarred: true, hasAttachments: true }),
    );
  });

  it('upserts idempotently without duplicating', async () => {
    await upsertMessage(db, message());
    await upsertMessage(db, message({ subject: 'Updated' }));

    const all = await listMessages(db);
    expect(all).toHaveLength(1);
    expect(all[0].subject).toBe('Updated');
  });

  it('finds by remote uid scoped to account and folder', async () => {
    await upsertMessage(db, message());

    expect(await findMessageByRemoteUid(db, 'acc_1', 'fold_1', 1)).not.toBeNull();
    expect(await findMessageByRemoteUid(db, 'acc_1', 'fold_1', 2)).toBeNull();
    expect(await findMessageByRemoteUid(db, 'acc_2', 'fold_1', 1)).toBeNull();
  });

  it('lists thread messages oldest first', async () => {
    await upsertMessage(db, message({ id: 'm2', remoteUid: 2, receivedAt: 2_000 }));
    await upsertMessage(db, message({ id: 'm1', remoteUid: 1, receivedAt: 1_000 }));

    expect((await listMessagesByThread(db, 'thr_1')).map((m) => m.id)).toEqual(['m1', 'm2']);
  });

  it('updates read and starred flags', async () => {
    await upsertMessage(db, message());
    await setMessageRead(db, 'msg_1', true);
    await setMessageStarred(db, 'msg_1', true);

    let loaded = await getMessage(db, 'msg_1');
    expect(loaded?.isRead).toBe(true);
    expect(loaded?.isStarred).toBe(true);

    await setThreadRead(db, 'thr_1', false);
    loaded = await getMessage(db, 'msg_1');
    expect(loaded?.isRead).toBe(false);
  });

  it('deletes a message and its attachments', async () => {
    await upsertMessage(db, message());
    await db.runAsync(
      `INSERT INTO attachments (id, message_id, filename, mime_type, size_bytes)
       VALUES ('att_1', 'msg_1', 'f.pdf', 'application/pdf', 10)`,
    );

    await deleteMessage(db, 'msg_1');

    expect(await getMessage(db, 'msg_1')).toBeNull();
    const row = await db.getFirstAsync<{ count: number }>(
      'SELECT COUNT(*) AS count FROM attachments',
    );
    expect(row?.count).toBe(0);
  });

  it('counts unread globally and per account', async () => {
    await upsertMessage(db, message({ id: 'm1', remoteUid: 1, isRead: false }));
    await upsertMessage(db, message({ id: 'm2', remoteUid: 2, isRead: true }));
    await upsertMessage(db, message({ id: 'm3', accountId: 'acc_2', remoteUid: 3, isRead: false }));

    expect(await countUnread(db)).toBe(2);
    expect(await countUnread(db, 'acc_2')).toBe(1);
  });

  it('maps raw message-id headers to thread ids', async () => {
    await upsertMessage(db, message({ id: 'm1', messageIdHeader: '<a@x.com>' }));
    await upsertMessage(
      db,
      message({
        id: 'm2',
        remoteUid: 2,
        messageIdHeader: '<b@x.com>',
        threadId: 'thr_2',
      }),
    );
    await upsertMessage(db, message({ id: 'm3', remoteUid: 3, messageIdHeader: null }));

    const map = await getThreadIdByMessageIdHeader(db, 'acc_1');
    expect(map.get('<a@x.com>')).toBe('thr_1');
    expect(map.get('<b@x.com>')).toBe('thr_2');
    expect(map.size).toBe(2);
  });

  it('lists messages newest first', async () => {
    await upsertMessage(db, message({ id: 'm1', remoteUid: 1, receivedAt: 1_000 }));
    await upsertMessage(db, message({ id: 'm2', remoteUid: 2, receivedAt: 2_000 }));

    expect((await listMessages(db)).map((m) => m.id)).toEqual(['m2', 'm1']);
  });

  it('searches case-insensitively across subject, body and sender', async () => {
    await upsertMessage(db, message({ id: 'm1', subject: 'Invoice', bodyText: 'x' }));
    await upsertMessage(
      db,
      message({ id: 'm2', remoteUid: 2, subject: 'x', bodyText: 'Payment due' }),
    );
    await upsertMessage(
      db,
      message({
        id: 'm3',
        remoteUid: 3,
        subject: 'x',
        bodyText: 'x',
        senderAddress: 'Billing@Example.com',
      }),
    );

    expect((await searchMessages(db, 'INVOICE')).map((m) => m.id)).toEqual(['m1']);
    expect((await searchMessages(db, 'payment')).map((m) => m.id)).toEqual(['m2']);
    expect((await searchMessages(db, 'billing@example')).map((m) => m.id)).toEqual(['m3']);
  });
});
