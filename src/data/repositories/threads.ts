/**
 * Thread repository, including the denormalised aggregates the conversation
 * list needs (`ThreadSummary`).
 */

import type { Database, SqlValue } from '@/data/db/database';
import type { Thread, ThreadSummary } from '@/domain/models';

interface ThreadRow {
  id: string;
  account_id: string;
  normalized_subject: string;
  last_message_at: number;
  unread_count: number;
  is_pinned: number;
  is_archived: number;
}

function mapThread(row: ThreadRow): Thread {
  return {
    id: row.id,
    accountId: row.account_id,
    normalizedSubject: row.normalized_subject,
    lastMessageAt: row.last_message_at,
    unreadCount: row.unread_count,
    isPinned: row.is_pinned !== 0,
    isArchived: row.is_archived !== 0,
  };
}

interface ThreadSummaryRow extends ThreadRow {
  message_count: number;
  has_attachments: number | null;
  last_sender_name: string | null;
  last_sender_address: string | null;
  last_subject: string | null;
  last_body_text: string | null;
  last_received_at: number | null;
}

function mapThreadSummary(row: ThreadSummaryRow): ThreadSummary {
  return {
    ...mapThread(row),
    messageCount: row.message_count,
    hasAttachments: row.has_attachments !== null && row.has_attachments !== 0,
    lastMessage: {
      senderName: row.last_sender_name ?? '',
      senderAddress: row.last_sender_address ?? '',
      subject: row.last_subject ?? '',
      bodyText: row.last_body_text ?? '',
      receivedAt: row.last_received_at ?? row.last_message_at,
    },
  };
}

export async function upsertThread(db: Database, thread: Thread): Promise<void> {
  await db.runAsync(
    `INSERT INTO threads
       (id, account_id, normalized_subject, last_message_at, unread_count, is_pinned, is_archived)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       account_id = excluded.account_id,
       normalized_subject = excluded.normalized_subject,
       last_message_at = excluded.last_message_at,
       unread_count = excluded.unread_count,
       is_pinned = excluded.is_pinned,
       is_archived = excluded.is_archived`,
    [
      thread.id,
      thread.accountId,
      thread.normalizedSubject,
      thread.lastMessageAt,
      thread.unreadCount,
      thread.isPinned ? 1 : 0,
      thread.isArchived ? 1 : 0,
    ],
  );
}

export async function getThread(db: Database, id: string): Promise<Thread | null> {
  const row = await db.getFirstAsync<ThreadRow>('SELECT * FROM threads WHERE id = ?', [id]);
  return row ? mapThread(row) : null;
}

export async function listThreadSummaries(
  db: Database,
  options?: { accountId?: string; includeArchived?: boolean; limit?: number },
): Promise<ThreadSummary[]> {
  const conditions: string[] = [];
  const params: SqlValue[] = [];

  if (options?.accountId !== undefined) {
    conditions.push('t.account_id = ?');
    params.push(options.accountId);
  }
  if (!options?.includeArchived) {
    conditions.push('t.is_archived = 0');
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  // `LIMIT -1` means "no limit" in SQLite, so the optional limit stays positional.
  params.push(options?.limit ?? -1);

  const rows = await db.getAllAsync<ThreadSummaryRow>(
    `SELECT
       t.*,
       (SELECT COUNT(*) FROM messages m WHERE m.thread_id = t.id) AS message_count,
       (SELECT MAX(m.has_attachments) FROM messages m WHERE m.thread_id = t.id) AS has_attachments,
       (SELECT m.sender_name FROM messages m
          WHERE m.thread_id = t.id ORDER BY m.received_at DESC, m.id DESC LIMIT 1) AS last_sender_name,
       (SELECT m.sender_address FROM messages m
          WHERE m.thread_id = t.id ORDER BY m.received_at DESC, m.id DESC LIMIT 1) AS last_sender_address,
       (SELECT m.subject FROM messages m
          WHERE m.thread_id = t.id ORDER BY m.received_at DESC, m.id DESC LIMIT 1) AS last_subject,
       (SELECT m.body_text FROM messages m
          WHERE m.thread_id = t.id ORDER BY m.received_at DESC, m.id DESC LIMIT 1) AS last_body_text,
       (SELECT m.received_at FROM messages m
          WHERE m.thread_id = t.id ORDER BY m.received_at DESC, m.id DESC LIMIT 1) AS last_received_at
     FROM threads t
     ${where}
     ORDER BY t.last_message_at DESC
     LIMIT ?`,
    params,
  );

  return rows.map(mapThreadSummary);
}

export async function setThreadPinned(db: Database, id: string, pinned: boolean): Promise<void> {
  await db.runAsync('UPDATE threads SET is_pinned = ? WHERE id = ?', [pinned ? 1 : 0, id]);
}

export async function setThreadArchived(
  db: Database,
  id: string,
  archived: boolean,
): Promise<void> {
  await db.runAsync('UPDATE threads SET is_archived = ? WHERE id = ?', [archived ? 1 : 0, id]);
}

export async function recomputeThreadAggregates(db: Database, threadId: string): Promise<void> {
  await db.runAsync(
    `UPDATE threads SET
       unread_count = (SELECT COUNT(*) FROM messages WHERE thread_id = ? AND is_read = 0),
       last_message_at = COALESCE(
         (SELECT MAX(received_at) FROM messages WHERE thread_id = ?),
         0
       )
     WHERE id = ?`,
    [threadId, threadId, threadId],
  );
}
