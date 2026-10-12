/**
 * Notification event repository (audit/log of notification decisions).
 */

import type { Database } from '@/data/db/database';
import type { NotificationEvent } from '@/domain/models';

interface EventRow {
  id: string;
  message_id: string;
  rule_id: string | null;
  notified_at: number;
  result: string;
  reason: string;
}

function mapEvent(row: EventRow): NotificationEvent {
  return {
    id: row.id,
    messageId: row.message_id,
    ruleId: row.rule_id,
    notifiedAt: row.notified_at,
    result: row.result as NotificationEvent['result'],
    reason: row.reason,
  };
}

export async function recordEvent(db: Database, event: NotificationEvent): Promise<void> {
  await db.runAsync(
    `INSERT INTO notification_events (id, message_id, rule_id, notified_at, result, reason)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [event.id, event.messageId, event.ruleId, event.notifiedAt, event.result, event.reason],
  );
}

export async function listRecentEvents(
  db: Database,
  sinceMs: number,
): Promise<NotificationEvent[]> {
  const rows = await db.getAllAsync<EventRow>(
    'SELECT * FROM notification_events WHERE notified_at >= ? ORDER BY notified_at DESC',
    [sinceMs],
  );
  return rows.map(mapEvent);
}

export async function pruneEventsBefore(db: Database, beforeMs: number): Promise<void> {
  await db.runAsync('DELETE FROM notification_events WHERE notified_at < ?', [beforeMs]);
}
