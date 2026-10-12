/**
 * Message repository.
 *
 * JSON columns (`to_json`, `cc_json`) are serialised on write and parsed on read
 * with a safe fallback so a corrupt row never throws into the UI.
 */

import type { Database, SqlValue } from '@/data/db/database';
import type { EmailAddress, Message, SyncState } from '@/domain/models';

interface MessageRow {
  id: string;
  account_id: string;
  folder_id: string;
  remote_uid: number | null;
  message_id_header: string | null;
  in_reply_to: string | null;
  references_header: string | null;
  thread_id: string;
  sender_name: string;
  sender_address: string;
  to_json: string;
  cc_json: string;
  subject: string;
  body_text: string;
  body_html_sanitized: string | null;
  received_at: number;
  is_read: number;
  is_starred: number;
  has_attachments: number;
  sync_state: string;
}

function parseAddresses(value: string): EmailAddress[] {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? (parsed as EmailAddress[]) : [];
  } catch {
    return [];
  }
}

function mapMessage(row: MessageRow): Message {
  return {
    id: row.id,
    accountId: row.account_id,
    folderId: row.folder_id,
    remoteUid: row.remote_uid,
    messageIdHeader: row.message_id_header,
    inReplyTo: row.in_reply_to,
    referencesHeader: row.references_header,
    threadId: row.thread_id,
    senderName: row.sender_name,
    senderAddress: row.sender_address,
    to: parseAddresses(row.to_json),
    cc: parseAddresses(row.cc_json),
    subject: row.subject,
    bodyText: row.body_text,
    bodyHtmlSanitized: row.body_html_sanitized,
    receivedAt: row.received_at,
    isRead: row.is_read !== 0,
    isStarred: row.is_starred !== 0,
    hasAttachments: row.has_attachments !== 0,
    syncState: row.sync_state as SyncState,
  };
}

export async function upsertMessage(db: Database, message: Message): Promise<void> {
  await db.runAsync(
    `INSERT INTO messages
       (id, account_id, folder_id, remote_uid, message_id_header, in_reply_to, references_header,
        thread_id, sender_name, sender_address, to_json, cc_json, subject, body_text,
        body_html_sanitized, received_at, is_read, is_starred, has_attachments, sync_state)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       account_id = excluded.account_id,
       folder_id = excluded.folder_id,
       remote_uid = excluded.remote_uid,
       message_id_header = excluded.message_id_header,
       in_reply_to = excluded.in_reply_to,
       references_header = excluded.references_header,
       thread_id = excluded.thread_id,
       sender_name = excluded.sender_name,
       sender_address = excluded.sender_address,
       to_json = excluded.to_json,
       cc_json = excluded.cc_json,
       subject = excluded.subject,
       body_text = excluded.body_text,
       body_html_sanitized = excluded.body_html_sanitized,
       received_at = excluded.received_at,
       is_read = excluded.is_read,
       is_starred = excluded.is_starred,
       has_attachments = excluded.has_attachments,
       sync_state = excluded.sync_state`,
    [
      message.id,
      message.accountId,
      message.folderId,
      message.remoteUid,
      message.messageIdHeader,
      message.inReplyTo,
      message.referencesHeader,
      message.threadId,
      message.senderName,
      message.senderAddress,
      JSON.stringify(message.to),
      JSON.stringify(message.cc),
      message.subject,
      message.bodyText,
      message.bodyHtmlSanitized,
      message.receivedAt,
      message.isRead ? 1 : 0,
      message.isStarred ? 1 : 0,
      message.hasAttachments ? 1 : 0,
      message.syncState,
    ],
  );
}

export async function getMessage(db: Database, id: string): Promise<Message | null> {
  const row = await db.getFirstAsync<MessageRow>('SELECT * FROM messages WHERE id = ?', [id]);
  return row ? mapMessage(row) : null;
}

export async function findMessageByRemoteUid(
  db: Database,
  accountId: string,
  folderId: string,
  remoteUid: number,
): Promise<Message | null> {
  const row = await db.getFirstAsync<MessageRow>(
    'SELECT * FROM messages WHERE account_id = ? AND folder_id = ? AND remote_uid = ?',
    [accountId, folderId, remoteUid],
  );
  return row ? mapMessage(row) : null;
}

export async function listMessagesByThread(db: Database, threadId: string): Promise<Message[]> {
  const rows = await db.getAllAsync<MessageRow>(
    'SELECT * FROM messages WHERE thread_id = ? ORDER BY received_at ASC, id ASC',
    [threadId],
  );
  return rows.map(mapMessage);
}

export async function setMessageRead(db: Database, id: string, isRead: boolean): Promise<void> {
  await db.runAsync('UPDATE messages SET is_read = ? WHERE id = ?', [isRead ? 1 : 0, id]);
}

export async function setThreadRead(
  db: Database,
  threadId: string,
  isRead: boolean,
): Promise<void> {
  await db.runAsync('UPDATE messages SET is_read = ? WHERE thread_id = ?', [
    isRead ? 1 : 0,
    threadId,
  ]);
}

export async function setMessageStarred(
  db: Database,
  id: string,
  isStarred: boolean,
): Promise<void> {
  await db.runAsync('UPDATE messages SET is_starred = ? WHERE id = ?', [isStarred ? 1 : 0, id]);
}

export async function deleteMessage(db: Database, id: string): Promise<void> {
  await db.runAsync('DELETE FROM attachments WHERE message_id = ?', [id]);
  await db.runAsync('DELETE FROM messages WHERE id = ?', [id]);
}

/**
 * Drop every local message of a folder. Used when the server's UIDVALIDITY
 * changes, which invalidates all previously assigned UIDs (plan §5).
 */
export async function deleteMessagesInFolder(db: Database, folderId: string): Promise<void> {
  await db.runAsync(
    'DELETE FROM attachments WHERE message_id IN (SELECT id FROM messages WHERE folder_id = ?)',
    [folderId],
  );
  await db.runAsync('DELETE FROM messages WHERE folder_id = ?', [folderId]);
}

export async function countUnread(db: Database, accountId?: string): Promise<number> {
  const row = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) AS count FROM messages WHERE is_read = 0 AND (? IS NULL OR account_id = ?)',
    [accountId ?? null, accountId ?? null],
  );
  return row?.count ?? 0;
}

/**
 * Map every stored `message_id_header` to its thread id.
 *
 * The map key is the *raw stored header value*, verbatim. Callers that compare
 * against parsed ids must normalise both sides with `parseMessageIds` first.
 */
export async function getThreadIdByMessageIdHeader(
  db: Database,
  accountId: string,
): Promise<Map<string, string>> {
  const rows = await db.getAllAsync<{ message_id_header: string; thread_id: string }>(
    'SELECT message_id_header, thread_id FROM messages WHERE account_id = ? AND message_id_header IS NOT NULL',
    [accountId],
  );
  const map = new Map<string, string>();
  for (const row of rows) {
    map.set(row.message_id_header, row.thread_id);
  }
  return map;
}

export async function listMessages(
  db: Database,
  options?: { accountId?: string; limit?: number },
): Promise<Message[]> {
  const conditions: string[] = [];
  const params: SqlValue[] = [];
  if (options?.accountId !== undefined) {
    conditions.push('account_id = ?');
    params.push(options.accountId);
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  params.push(options?.limit ?? -1);

  const rows = await db.getAllAsync<MessageRow>(
    `SELECT * FROM messages ${where} ORDER BY received_at DESC, id DESC LIMIT ?`,
    params,
  );
  return rows.map(mapMessage);
}

export async function searchMessages(
  db: Database,
  query: string,
  options?: { accountId?: string; limit?: number },
): Promise<Message[]> {
  const pattern = `%${query.toLowerCase()}%`;
  const conditions = [
    '(LOWER(subject) LIKE ? OR LOWER(body_text) LIKE ? OR LOWER(sender_address) LIKE ?)',
  ];
  const params: SqlValue[] = [pattern, pattern, pattern];
  if (options?.accountId !== undefined) {
    conditions.push('account_id = ?');
    params.push(options.accountId);
  }
  params.push(options?.limit ?? -1);

  const rows = await db.getAllAsync<MessageRow>(
    `SELECT * FROM messages WHERE ${conditions.join(' AND ')}
     ORDER BY received_at DESC, id DESC LIMIT ?`,
    params,
  );
  return rows.map(mapMessage);
}
