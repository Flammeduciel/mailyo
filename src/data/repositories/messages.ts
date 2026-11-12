/**
 * Message repository.
 *
 * JSON columns (`to_json`, `cc_json`) are serialised on write and parsed on read
 * with a safe fallback so a corrupt row never throws into the UI.
 */

import type { NameRow } from '@/domain/names';
import type { Database, SqlValue } from '@/data/db/database';
import type { EmailAddress, MailCategory, Message, SyncState } from '@/domain/models';
import { repairMojibake } from '@/domain/mojibake';
import { buildFtsQuery } from '@/domain/search';

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
  category?: string | null;
  list_unsubscribe?: string | null;
  list_unsubscribe_post?: string | null;
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
    senderName: repairMojibake(row.sender_name),
    senderAddress: row.sender_address,
    to: parseAddresses(row.to_json),
    cc: parseAddresses(row.cc_json),
    subject: repairMojibake(row.subject),
    bodyText: row.body_text,
    bodyHtmlSanitized: row.body_html_sanitized,
    receivedAt: row.received_at,
    isRead: row.is_read !== 0,
    isStarred: row.is_starred !== 0,
    hasAttachments: row.has_attachments !== 0,
    syncState: row.sync_state as SyncState,
    category: (row.category ?? null) as MailCategory | null,
    listUnsubscribe: row.list_unsubscribe ?? null,
    listUnsubscribePost: row.list_unsubscribe_post ?? null,
  };
}

export async function upsertMessage(db: Database, message: Message): Promise<void> {
  await db.runAsync(
    `INSERT INTO messages
       (id, account_id, folder_id, remote_uid, message_id_header, in_reply_to, references_header,
        thread_id, sender_name, sender_address, to_json, cc_json, subject, body_text,
        body_html_sanitized, received_at, is_read, is_starred, has_attachments, sync_state,
        category, list_unsubscribe, list_unsubscribe_post)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
       sync_state = excluded.sync_state,
       -- The same mail seen in SENT carries no category: keep the inbox one.
       category = COALESCE(excluded.category, messages.category),
       list_unsubscribe = COALESCE(excluded.list_unsubscribe, messages.list_unsubscribe),
       list_unsubscribe_post = COALESCE(excluded.list_unsubscribe_post, messages.list_unsubscribe_post)`,
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
      message.category ?? null,
      message.listUnsubscribe ?? null,
      message.listUnsubscribePost ?? null,
    ],
  );
}

/** Oldest provider UID stored for a folder, the cursor for loading older mail. */
export async function getOldestRemoteUid(db: Database, folderId: string): Promise<number | null> {
  const row = await db.getFirstAsync<{ oldest: number | null }>(
    'SELECT MIN(remote_uid) AS oldest FROM messages WHERE folder_id = ? AND remote_uid IS NOT NULL',
    [folderId],
  );
  return row?.oldest ?? null;
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

/** Message-ID header of an account's message with this provider UID, in any folder. */
export async function findMessageIdHeaderByRemoteUid(
  db: Database,
  accountId: string,
  remoteUid: number,
): Promise<string | null> {
  const row = await db.getFirstAsync<{ message_id_header: string | null }>(
    'SELECT message_id_header FROM messages WHERE account_id = ? AND remote_uid = ? LIMIT 1',
    [accountId, remoteUid],
  );
  return row?.message_id_header ?? null;
}

/** Remote folder holding a stored message (IMAP UIDs are per folder); inbox first. */
export async function findRemoteFolderByRemoteUid(
  db: Database,
  accountId: string,
  remoteUid: number,
): Promise<string | null> {
  const row = await db.getFirstAsync<{ remote_folder_id: string }>(
    `SELECT f.remote_folder_id FROM messages m JOIN folders f ON f.id = m.folder_id
      WHERE m.account_id = ? AND m.remote_uid = ?
      ORDER BY CASE f.role WHEN 'inbox' THEN 0 WHEN 'spam' THEN 1 ELSE 2 END LIMIT 1`,
    [accountId, remoteUid],
  );
  return row?.remote_folder_id ?? null;
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
    // Spam never counts towards the unread badge.
    `SELECT COUNT(*) AS count FROM messages m
      WHERE m.is_read = 0 AND (? IS NULL OR m.account_id = ?)
        AND NOT EXISTS (SELECT 1 FROM folders f WHERE f.id = m.folder_id AND f.role = 'spam')`,
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

export interface Correspondence {
  /** Messages from the address. */
  received: number;
  /** Messages to (or copying) the address. */
  sent: number;
  firstAt: number | null;
  lastAt: number | null;
}

/** Mail exchanged with one address (sender, or among the `to`/`cc` recipients). */
export async function getCorrespondence(db: Database, address: string): Promise<Correspondence> {
  const needle = address.toLowerCase();
  const pattern = `%"address":"${needle.replace(/[%_]/g, '')}"%`;
  const row = await db.getFirstAsync<{
    received: number;
    sent: number;
    first_at: number | null;
    last_at: number | null;
  }>(
    `SELECT
       SUM(CASE WHEN lower(sender_address) = ? THEN 1 ELSE 0 END) AS received,
       SUM(CASE WHEN lower(sender_address) <> ? THEN 1 ELSE 0 END) AS sent,
       MIN(received_at) AS first_at,
       MAX(received_at) AS last_at
     FROM messages
     WHERE lower(sender_address) = ? OR lower(to_json) LIKE ? OR lower(cc_json) LIKE ?`,
    [needle, needle, needle, pattern, pattern],
  );
  return {
    received: row?.received ?? 0,
    sent: row?.sent ?? 0,
    firstAt: row?.first_at ?? null,
    lastAt: row?.last_at ?? null,
  };
}

/** Someone the user has exchanged mail with. */
export interface Correspondent {
  name: string;
  address: string;
  /** Messages exchanged (both directions). */
  count: number;
  lastAt: number;
}

/**
 * Everyone the user has written to or received mail from, most recent first.
 * Senders come from `sender_address`, recipients from the `to`/`cc` JSON.
 */
export async function listCorrespondents(
  db: Database,
  selfAddresses: string[],
  limit = 500,
): Promise<Correspondent[]> {
  const rows = await db.getAllAsync<{ name: string; address: string; at: number }>(
    `SELECT sender_name AS name, sender_address AS address, received_at AS at FROM messages
     UNION ALL
     SELECT json_extract(r.value, '$.name'), json_extract(r.value, '$.address'), m.received_at
       FROM messages m, json_each(CASE WHEN json_valid(m.to_json) THEN m.to_json ELSE '[]' END) r
     UNION ALL
     SELECT json_extract(r.value, '$.name'), json_extract(r.value, '$.address'), m.received_at
       FROM messages m, json_each(CASE WHEN json_valid(m.cc_json) THEN m.cc_json ELSE '[]' END) r`,
  );
  const self = new Set(selfAddresses.map((address) => address.toLowerCase()));
  const byAddress = new Map<string, Correspondent>();
  for (const row of rows) {
    const address = (row.address ?? '').trim();
    const key = address.toLowerCase();
    if (!key.includes('@') || self.has(key)) continue;
    const name = repairMojibake((row.name ?? '').trim());
    const current = byAddress.get(key);
    if (!current) {
      byAddress.set(key, { name: name === address ? '' : name, address, count: 1, lastAt: row.at });
      continue;
    }
    current.count += 1;
    if (row.at > current.lastAt) current.lastAt = row.at;
    // Prefer a real display name over an empty one or the bare address.
    if (!current.name && name && name !== address) current.name = name;
  }
  return [...byAddress.values()].sort((a, b) => b.lastAt - a.lastAt).slice(0, limit);
}

/** Store List-Unsubscribe headers fetched after the message itself (backfill). */
export async function setUnsubscribeHeaders(
  db: Database,
  id: string,
  listUnsubscribe: string | null,
  listUnsubscribePost: string | null,
): Promise<void> {
  await db.runAsync(
    'UPDATE messages SET list_unsubscribe = ?, list_unsubscribe_post = ? WHERE id = ?',
    [listUnsubscribe ?? '', listUnsubscribePost, id],
  );
}

/** Sender of bulk mail (has List-Unsubscribe), aggregated for the subscriptions screen. */
export interface MailingSender {
  address: string;
  name: string;
  count: number;
  lastAt: number;
  /** Latest message id carrying the headers. */
  messageId: string;
  accountId: string;
  listUnsubscribe: string;
  listUnsubscribePost: string | null;
}

export async function listMailingSenders(db: Database): Promise<MailingSender[]> {
  const rows = await db.getAllAsync<{
    address: string;
    name: string;
    count: number;
    last_at: number;
    message_id: string;
    account_id: string;
    unsub: string;
    unsub_post: string | null;
  }>(
    `SELECT lower(m.sender_address) AS address,
            MAX(m.sender_name) AS name,
            COUNT(*) AS count,
            MAX(m.received_at) AS last_at,
            (SELECT x.id FROM messages x WHERE lower(x.sender_address) = lower(m.sender_address)
               AND x.list_unsubscribe IS NOT NULL AND x.list_unsubscribe <> ''
             ORDER BY x.received_at DESC LIMIT 1) AS message_id,
            MAX(m.account_id) AS account_id,
            (SELECT x.list_unsubscribe FROM messages x WHERE lower(x.sender_address) = lower(m.sender_address)
               AND x.list_unsubscribe IS NOT NULL AND x.list_unsubscribe <> ''
             ORDER BY x.received_at DESC LIMIT 1) AS unsub,
            (SELECT x.list_unsubscribe_post FROM messages x WHERE lower(x.sender_address) = lower(m.sender_address)
               AND x.list_unsubscribe IS NOT NULL AND x.list_unsubscribe <> ''
             ORDER BY x.received_at DESC LIMIT 1) AS unsub_post
       FROM messages m
      GROUP BY lower(m.sender_address)
     HAVING unsub IS NOT NULL
      ORDER BY count DESC, last_at DESC`,
  );
  return rows.map((row) => ({
    address: row.address,
    name: repairMojibake(row.name ?? ''),
    count: row.count,
    lastAt: row.last_at,
    messageId: row.message_id,
    accountId: row.account_id,
    listUnsubscribe: row.unsub,
    listUnsubscribePost: row.unsub_post,
  }));
}

/** Messages whose List-Unsubscribe header was never looked up (NULL; '' = none). */
export async function listMessagesMissingUnsubscribe(
  db: Database,
  limit = 200,
): Promise<{ id: string; accountId: string; remoteUid: number }[]> {
  const rows = await db.getAllAsync<{ id: string; account_id: string; remote_uid: number }>(
    `SELECT id, account_id, remote_uid FROM messages
      WHERE list_unsubscribe IS NULL AND remote_uid IS NOT NULL
        AND lower(sender_address) NOT IN (SELECT lower(email_address) FROM accounts)
      ORDER BY received_at DESC LIMIT ?`,
    [limit],
  );
  return rows.map((row) => ({ id: row.id, accountId: row.account_id, remoteUid: row.remote_uid }));
}

/** Move messages to another local folder (spam / not spam). */
export async function moveMessageToFolder(
  db: Database,
  id: string,
  folderId: string,
): Promise<void> {
  await db.runAsync('UPDATE OR IGNORE messages SET folder_id = ? WHERE id = ?', [folderId, id]);
}

export interface ThreadingRow {
  id: string;
  threadId: string;
  messageIdHeader: string | null;
  inReplyTo: string | null;
  referencesHeader: string | null;
  subject: string;
}

/** Threading headers of an account's mail, oldest first. */
export async function listThreadingRows(db: Database, accountId: string): Promise<ThreadingRow[]> {
  const rows = await db.getAllAsync<{
    id: string;
    thread_id: string;
    message_id_header: string | null;
    in_reply_to: string | null;
    references_header: string | null;
    subject: string;
  }>(
    `SELECT id, thread_id, message_id_header, in_reply_to, references_header, subject
     FROM messages WHERE account_id = ? ORDER BY received_at ASC, id ASC`,
    [accountId],
  );
  return rows.map((row) => ({
    id: row.id,
    threadId: row.thread_id,
    messageIdHeader: row.message_id_header,
    inReplyTo: row.in_reply_to,
    referencesHeader: row.references_header,
    subject: row.subject,
  }));
}

export async function setMessageThreadId(
  db: Database,
  id: string,
  threadId: string,
): Promise<void> {
  await db.runAsync('UPDATE messages SET thread_id = ? WHERE id = ?', [threadId, id]);
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
  const match = buildFtsQuery(query);
  if (match === null) {
    return [];
  }

  const conditions = ['messages_fts MATCH ?'];
  const params: SqlValue[] = [match];
  if (options?.accountId !== undefined) {
    conditions.push('m.account_id = ?');
    params.push(options.accountId);
  }
  params.push(options?.limit ?? -1);

  const rows = await db.getAllAsync<MessageRow>(
    `SELECT m.* FROM messages_fts f
       JOIN messages m ON m.rowid = f.rowid
     WHERE ${conditions.join(' AND ')}
     ORDER BY m.received_at DESC, m.id DESC
     LIMIT ?`,
    params,
  );
  return rows.map(mapMessage);
}

/** Names seen in stored mail (sender, To, Cc), oldest first, for the name book. */
export async function listNameRows(db: Database): Promise<NameRow[]> {
  const rows = await db.getAllAsync<{
    sender_name: string;
    sender_address: string;
    to_json: string;
    cc_json: string;
  }>('SELECT sender_name, sender_address, to_json, cc_json FROM messages ORDER BY received_at ASC');
  return rows.map((row) => ({
    senderName: repairMojibake(row.sender_name),
    senderAddress: row.sender_address,
    to: parseAddresses(row.to_json),
    cc: parseAddresses(row.cc_json),
  }));
}

/** Thread of a mail by Message-ID, else the latest thread with that sender. */
export async function findThreadIdForMail(
  db: Database,
  input: { accountId?: string | null; messageIdHeader?: string | null; from?: string | null },
): Promise<string | null> {
  const account = input.accountId ? ' AND account_id = ?' : '';
  const accountParams: SqlValue[] = input.accountId ? [input.accountId] : [];
  if (input.messageIdHeader) {
    const id = input.messageIdHeader.trim();
    const bare = id.replace(/^<|>$/g, '');
    const row = await db.getFirstAsync<{ thread_id: string }>(
      `SELECT thread_id FROM messages WHERE message_id_header IN (?, ?, ?)${account} LIMIT 1`,
      [id, bare, `<${bare}>`, ...accountParams],
    );
    if (row) return row.thread_id;
  }
  if (input.from) {
    const row = await db.getFirstAsync<{ thread_id: string }>(
      `SELECT thread_id FROM messages WHERE lower(sender_address) = ?${account}
       ORDER BY received_at DESC LIMIT 1`,
      [input.from.trim().toLowerCase(), ...accountParams],
    );
    if (row) return row.thread_id;
  }
  return null;
}
