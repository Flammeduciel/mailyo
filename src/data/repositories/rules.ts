/**
 * Notification rule repository.
 */

import type { Database, SqlValue } from '@/data/db/database';
import type { NotificationRule, RuleAction, RuleMatchType, VibrationMode } from '@/domain/models';

interface RuleRow {
  id: string;
  account_id: string | null;
  match_type: string;
  match_value: string;
  action: string;
  sound_id: string | null;
  vibration_mode: string;
  enabled: number;
  created_at: number;
}

function mapRule(row: RuleRow): NotificationRule {
  return {
    id: row.id,
    accountId: row.account_id,
    matchType: row.match_type as RuleMatchType,
    matchValue: row.match_value,
    action: row.action as RuleAction,
    soundId: row.sound_id,
    vibrationMode: row.vibration_mode as VibrationMode,
    enabled: row.enabled !== 0,
    createdAt: row.created_at,
  };
}

function ruleParams(rule: NotificationRule): SqlValue[] {
  return [
    rule.id,
    rule.accountId,
    rule.matchType,
    rule.matchValue,
    rule.action,
    rule.soundId,
    rule.vibrationMode,
    rule.enabled ? 1 : 0,
    rule.createdAt,
  ];
}

export async function insertRule(db: Database, rule: NotificationRule): Promise<void> {
  await db.runAsync(
    `INSERT INTO notification_rules
       (id, account_id, match_type, match_value, action, sound_id, vibration_mode, enabled, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ruleParams(rule),
  );
}

export async function upsertRule(db: Database, rule: NotificationRule): Promise<void> {
  await db.runAsync(
    `INSERT INTO notification_rules
       (id, account_id, match_type, match_value, action, sound_id, vibration_mode, enabled, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       account_id = excluded.account_id,
       match_type = excluded.match_type,
       match_value = excluded.match_value,
       action = excluded.action,
       sound_id = excluded.sound_id,
       vibration_mode = excluded.vibration_mode,
       enabled = excluded.enabled,
       created_at = excluded.created_at`,
    ruleParams(rule),
  );
}

export async function updateRule(db: Database, rule: NotificationRule): Promise<void> {
  await db.runAsync(
    `UPDATE notification_rules SET
       account_id = ?,
       match_type = ?,
       match_value = ?,
       action = ?,
       sound_id = ?,
       vibration_mode = ?,
       enabled = ?
     WHERE id = ?`,
    [
      rule.accountId,
      rule.matchType,
      rule.matchValue,
      rule.action,
      rule.soundId,
      rule.vibrationMode,
      rule.enabled ? 1 : 0,
      rule.id,
    ],
  );
}

export async function setRuleEnabled(db: Database, id: string, enabled: boolean): Promise<void> {
  await db.runAsync('UPDATE notification_rules SET enabled = ? WHERE id = ?', [
    enabled ? 1 : 0,
    id,
  ]);
}

export async function deleteRule(db: Database, id: string): Promise<void> {
  await db.runAsync('DELETE FROM notification_rules WHERE id = ?', [id]);
}

/**
 * List rules ordered by creation time (specificity ordering is the caller's job).
 *
 * - `accountId === undefined`: every rule.
 * - `accountId === null`: global rules only.
 * - otherwise: global rules plus rules owned by that account.
 */
export async function listRules(
  db: Database,
  accountId?: string | null,
): Promise<NotificationRule[]> {
  if (accountId === undefined) {
    const rows = await db.getAllAsync<RuleRow>(
      'SELECT * FROM notification_rules ORDER BY created_at ASC',
    );
    return rows.map(mapRule);
  }
  const rows = await db.getAllAsync<RuleRow>(
    'SELECT * FROM notification_rules WHERE account_id IS NULL OR account_id = ? ORDER BY created_at ASC',
    [accountId],
  );
  return rows.map(mapRule);
}
