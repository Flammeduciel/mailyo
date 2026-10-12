/**
 * Key/value application settings repository.
 */

import type { Database, SqlValue } from '@/data/db/database';

export async function setSetting(db: Database, key: string, value: string): Promise<void> {
  await db.runAsync(
    `INSERT INTO app_settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [key, value],
  );
}

export async function getSetting(db: Database, key: string): Promise<string | null> {
  const row = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM app_settings WHERE key = ?',
    [key],
  );
  return row?.value ?? null;
}

export async function getAllSettings(db: Database): Promise<Record<string, string>> {
  const rows = await db.getAllAsync<{ key: string; value: string }>(
    'SELECT key, value FROM app_settings',
  );
  const result: Record<string, string> = {};
  for (const row of rows) {
    result[row.key] = row.value;
  }
  return result;
}

export async function setSettings(
  db: Database,
  entries: Record<string, string>,
): Promise<void> {
  for (const [key, value] of Object.entries(entries)) {
    await setSetting(db, key, value);
  }
}

export async function deleteSetting(db: Database, key: string): Promise<void> {
  const params: SqlValue[] = [key];
  await db.runAsync('DELETE FROM app_settings WHERE key = ?', params);
}
