import type { Database } from '@/data/db/database';
import {
  getAttachment,
  searchAttachmentsByName,
  listAttachmentsByThread,
  replaceMessageAttachments,
  setAttachmentDownloaded,
} from '@/data/repositories/attachments';
import { upsertMessage } from '@/data/repositories/messages';
import { createMigratedDatabase } from '@/data/repositories/test-utils';
import type { Attachment, Message } from '@/domain/models';

function attachment(overrides: Partial<Attachment> = {}): Attachment {
  return {
    id: 'att_1',
    messageId: 'msg_1',
    filename: 'plan.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 2048,
    remotePartId: 'part1',
    localPath: null,
    downloadState: 'remote',
    ...overrides,
  };
}

describe('attachments repository', () => {
  let db: Database;

  beforeEach(async () => {
    db = await createMigratedDatabase();
    const message: Message = {
      id: 'msg_1',
      accountId: 'acc_1',
      folderId: 'fold_1',
      remoteUid: 1,
      messageIdHeader: null,
      inReplyTo: null,
      referencesHeader: null,
      threadId: 'thr_1',
      senderName: 'Bob',
      senderAddress: 'bob@example.com',
      to: [],
      cc: [],
      subject: 's',
      bodyText: '',
      bodyHtmlSanitized: null,
      receivedAt: 1,
      isRead: false,
      isStarred: false,
      hasAttachments: true,
      syncState: 'synced',
    };
    await upsertMessage(db, message);
  });

  it('stores and lists attachments of a thread', async () => {
    await replaceMessageAttachments(db, 'msg_1', [attachment(), attachment({ id: 'att_2' })]);
    const list = await listAttachmentsByThread(db, 'thr_1');
    expect(list.map((a) => a.id)).toEqual(['att_1', 'att_2']);
    expect(list[0]).toMatchObject({ filename: 'plan.pdf', sizeBytes: 2048 });
  });

  it('keeps the downloaded copy when a sync re-announces the attachment', async () => {
    await replaceMessageAttachments(db, 'msg_1', [attachment()]);
    await setAttachmentDownloaded(db, 'att_1', 'file:///cache/plan.pdf');
    await replaceMessageAttachments(db, 'msg_1', [attachment()]);
    expect(await getAttachment(db, 'att_1')).toMatchObject({
      localPath: 'file:///cache/plan.pdf',
      downloadState: 'downloaded',
    });
  });

  it('finds attachments by file name, with their conversation', async () => {
    await replaceMessageAttachments(db, 'msg_1', [
      attachment(),
      attachment({ id: 'att_2', filename: 'photo_50%.jpg', mimeType: 'image/jpeg' }),
    ]);
    const hits = await searchAttachmentsByName(db, 'PLAN');
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ threadId: 'thr_1', senderName: 'Bob' });
    expect((await searchAttachmentsByName(db, '50%')).map((h) => h.attachment.id)).toEqual([
      'att_2',
    ]);
    expect(await searchAttachmentsByName(db, '%')).toHaveLength(1);
  });
});
