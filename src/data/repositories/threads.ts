/**
 * Thread repository, including the denormalised aggregates the conversation
 * list needs (`ThreadSummary`).
 */

import { repairMojibake } from '@/domain/mojibake';
import type { Database, SqlValue } from '@/data/db/database';
import type {
  ConversationFilter,
  ConversationTab,
  EmailAddress,
  FolderRole,
  MailCategory,
  Thread,
  ThreadSummary,
} from '@/domain/models';

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
    normalizedSubject: repairMojibake(row.normalized_subject),
    lastMessageAt: row.last_message_at,
    unreadCount: row.unread_count,
    isPinned: row.is_pinned !== 0,
    isArchived: row.is_archived !== 0,
  };
}

interface ThreadSummaryRow extends ThreadRow {
  message_count: number;
  has_attachments: number | null;
  is_starred: number | null;
  is_spam?: number | null;
  last_sender_name: string | null;
  last_sender_address: string | null;
  last_subject: string | null;
  last_body_text: string | null;
  last_received_at: number | null;
  other_sender_name: string | null;
  other_sender_address: string | null;
  last_to_json: string | null;
}

/** First recipient of a stored `to_json` value. */
function firstRecipient(json: string | null): EmailAddress | null {
  try {
    const parsed = JSON.parse(json ?? '[]') as EmailAddress[];
    return parsed[0]?.address ? parsed[0] : null;
  } catch {
    return null;
  }
}

function mapThreadSummary(row: ThreadSummaryRow): ThreadSummary {
  const contact: EmailAddress = row.other_sender_address
    ? { name: repairMojibake(row.other_sender_name ?? ''), address: row.other_sender_address }
    : (firstRecipient(row.last_to_json) ?? {
        name: row.last_sender_name ?? '',
        address: row.last_sender_address ?? '',
      });
  return {
    contact,
    ...mapThread(row),
    messageCount: row.message_count,
    hasAttachments: row.has_attachments !== null && row.has_attachments !== 0,
    isStarred: row.is_starred !== null && row.is_starred !== 0,
    isSpam: Boolean(row.is_spam),
    lastMessage: {
      senderName: repairMojibake(row.last_sender_name ?? ''),
      senderAddress: row.last_sender_address ?? '',
      subject: repairMojibake(row.last_subject ?? ''),
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

/**
 * A thread's category is the one of its most recent categorised message (sent
 * mail has none); uncategorised threads (demo, IMAP) count as personal mail.
 */
const THREAD_CATEGORY = `COALESCE((SELECT m.category FROM messages m
   WHERE m.thread_id = t.id AND m.category IS NOT NULL
   ORDER BY m.received_at DESC LIMIT 1), 'primary')`;

const TAB_CATEGORIES: Record<Exclude<ConversationTab, 'favoris'>, MailCategory[]> = {
  discussions: ['primary'],
  actus: ['updates', 'promotions', 'social'],
  groupes: ['forums'],
};

/** The message was not sent by the thread's own account. */
const FROM_OTHER = `lower(m.sender_address) <> COALESCE(
   (SELECT lower(a.email_address) FROM accounts a WHERE a.id = t.account_id), '')`;

/** A message of the thread is in the provider's spam folder. */
const IS_SPAM = `EXISTS (SELECT 1 FROM messages m JOIN folders f ON f.id = m.folder_id
   WHERE m.thread_id = t.id AND f.role = 'spam')`;

const HAS_ATTACHMENTS =
  'EXISTS (SELECT 1 FROM messages m WHERE m.thread_id = t.id AND m.has_attachments = 1)';

const IS_STARRED =
  'EXISTS (SELECT 1 FROM messages m WHERE m.thread_id = t.id AND m.is_starred = 1)';

export interface ListThreadSummariesOptions {
  accountId?: string;
  includeArchived?: boolean;
  /** Only archived threads. */
  archivedOnly?: boolean;
  tab?: ConversationTab;
  /** One Gmail category inside a tab (e.g. Promotions inside « Actus »). */
  category?: MailCategory;
  filter?: ConversationFilter;
  /** Only threads holding a message in a folder of this role (e.g. 'sent'). */
  folderRole?: FolderRole;
  /** Only starred threads (any tab). */
  starredOnly?: boolean;
  limit?: number;
  offset?: number;
}

function buildConditions(
  options: ListThreadSummariesOptions | undefined,
  includeFilter: boolean,
): { conditions: string[]; params: SqlValue[] } {
  const conditions: string[] = [];
  const params: SqlValue[] = [];

  if (options?.accountId !== undefined) {
    conditions.push('t.account_id = ?');
    params.push(options.accountId);
  }
  if (options?.archivedOnly) {
    conditions.push('t.is_archived = 1');
  } else if (!options?.includeArchived) {
    conditions.push('t.is_archived = 0');
  }
  if (options?.tab === 'favoris') {
    conditions.push(IS_STARRED);
  } else if (options?.tab) {
    const categories = TAB_CATEGORIES[options.tab];
    // Spam has no Gmail category: it shows in every tab, flagged.
    conditions.push(
      `(${THREAD_CATEGORY} IN (${categories.map(() => '?').join(', ')}) OR ${IS_SPAM})`,
    );
    params.push(...categories);
  }
  if (options?.category) {
    conditions.push(`${THREAD_CATEGORY} = ?`);
    params.push(options.category);
  }
  if (options?.folderRole) {
    conditions.push(`EXISTS (SELECT 1 FROM messages m JOIN folders f ON f.id = m.folder_id
       WHERE m.thread_id = t.id AND f.role = ?)`);
    params.push(options.folderRole);
  }
  if (options?.starredOnly) {
    conditions.push(IS_STARRED);
  }
  if (includeFilter) {
    if (options?.filter === 'unread') {
      conditions.push('t.unread_count > 0');
    } else if (options?.filter === 'attachments') {
      conditions.push(HAS_ATTACHMENTS);
    } else if (options?.filter === 'spam') {
      conditions.push(IS_SPAM);
    }
  }
  return { conditions, params };
}

export async function isThreadSpam(db: Database, threadId: string): Promise<boolean> {
  const row = await db.getFirstAsync<{ spam: number }>(
    `SELECT ${IS_SPAM.replace(/t\.id/g, '?')} AS spam`,
    [threadId],
  );
  return Boolean(row?.spam);
}

export interface ConversationCounts {
  all: number;
  unread: number;
  attachments: number;
  spam: number;
}

/** Conversation counts shown on the filter chips (same tab/archive scope as the list). */
export async function countThreadSummaries(
  db: Database,
  options?: ListThreadSummariesOptions,
): Promise<ConversationCounts> {
  const { conditions, params } = buildConditions(options, false);
  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const row = await db.getFirstAsync<{
    all_count: number;
    unread: number;
    attachments: number;
    spam: number;
  }>(
    `SELECT COUNT(*) AS all_count,
            COALESCE(SUM(CASE WHEN t.unread_count > 0 THEN 1 ELSE 0 END), 0) AS unread,
            COALESCE(SUM(CASE WHEN ${HAS_ATTACHMENTS} THEN 1 ELSE 0 END), 0) AS attachments,
            COALESCE(SUM(CASE WHEN ${IS_SPAM} THEN 1 ELSE 0 END), 0) AS spam
       FROM threads t ${where}`,
    params,
  );
  return {
    all: row?.all_count ?? 0,
    unread: row?.unread ?? 0,
    attachments: row?.attachments ?? 0,
    spam: row?.spam ?? 0,
  };
}

/** Conversations per Gmail category in a tab (sub-filter counts). Spam is left out. */
export async function countByCategory(
  db: Database,
  options?: ListThreadSummariesOptions,
): Promise<Partial<Record<MailCategory, number>>> {
  const { conditions, params } = buildConditions({ ...options, category: undefined }, false);
  conditions.push(`NOT ${IS_SPAM}`);
  const rows = await db.getAllAsync<{ category: MailCategory; count: number }>(
    `SELECT ${THREAD_CATEGORY} AS category, COUNT(*) AS count FROM threads t
      WHERE ${conditions.join(' AND ')} GROUP BY 1`,
    params,
  );
  return Object.fromEntries(rows.map((row) => [row.category, row.count]));
}

export async function listThreadSummaries(
  db: Database,
  options?: ListThreadSummariesOptions,
): Promise<ThreadSummary[]> {
  const { conditions, params } = buildConditions(options, true);

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  // `LIMIT -1` means "no limit" in SQLite, so the optional limit stays positional.
  params.push(options?.limit ?? -1, options?.offset ?? 0);

  const rows = await db.getAllAsync<ThreadSummaryRow>(
    `SELECT
       t.*,
       (SELECT COUNT(*) FROM messages m WHERE m.thread_id = t.id) AS message_count,
       (SELECT MAX(m.has_attachments) FROM messages m WHERE m.thread_id = t.id) AS has_attachments,
       ${IS_STARRED} AS is_starred,
       ${IS_SPAM} AS is_spam,
       (SELECT m.sender_name FROM messages m
          WHERE m.thread_id = t.id ORDER BY m.received_at DESC, m.id DESC LIMIT 1) AS last_sender_name,
       (SELECT m.sender_address FROM messages m
          WHERE m.thread_id = t.id ORDER BY m.received_at DESC, m.id DESC LIMIT 1) AS last_sender_address,
       (SELECT m.subject FROM messages m
          WHERE m.thread_id = t.id ORDER BY m.received_at DESC, m.id DESC LIMIT 1) AS last_subject,
       (SELECT m.body_text FROM messages m
          WHERE m.thread_id = t.id ORDER BY m.received_at DESC, m.id DESC LIMIT 1) AS last_body_text,
       (SELECT m.received_at FROM messages m
          WHERE m.thread_id = t.id ORDER BY m.received_at DESC, m.id DESC LIMIT 1) AS last_received_at,
       (SELECT m.sender_name FROM messages m
          WHERE m.thread_id = t.id AND ${FROM_OTHER}
          ORDER BY m.received_at DESC, m.id DESC LIMIT 1) AS other_sender_name,
       (SELECT m.sender_address FROM messages m
          WHERE m.thread_id = t.id AND ${FROM_OTHER}
          ORDER BY m.received_at DESC, m.id DESC LIMIT 1) AS other_sender_address,
       (SELECT m.to_json FROM messages m
          WHERE m.thread_id = t.id ORDER BY m.received_at DESC, m.id DESC LIMIT 1) AS last_to_json
     FROM threads t
     ${where}
     ORDER BY t.is_pinned DESC, t.last_message_at DESC, t.id DESC
     LIMIT ? OFFSET ?`,
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

/** Drop an account's conversations that no longer hold any message. */
export async function deleteEmptyThreads(db: Database, accountId: string): Promise<void> {
  await db.runAsync(
    `DELETE FROM threads WHERE account_id = ?
       AND NOT EXISTS (SELECT 1 FROM messages m WHERE m.thread_id = threads.id)`,
    [accountId],
  );
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
