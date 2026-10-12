/**
 * Schema + migration tests run against real SQLite (`node:sqlite`), so they
 * validate the exact DDL the device will execute, including FTS5.
 */

import { createTestDatabase } from '@/data/db/testing';
import type { Database } from '@/data/db/database';
import { migrate, SCHEMA_VERSION } from '@/data/db/schema';

async function freshDb(): Promise<Database> {
  const db = createTestDatabase();
  await migrate(db);
  return db;
}

describe('database schema', () => {
  it('applies every migration and records the version', async () => {
    const db = await freshDb();
    const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
    expect(row?.user_version).toBe(SCHEMA_VERSION);
  });

  it('is idempotent when run twice', async () => {
    const db = await freshDb();
    await expect(migrate(db)).resolves.toBeUndefined();
  });

  it('refuses a database newer than the supported schema', async () => {
    const db = createTestDatabase();
    await db.execAsync(`PRAGMA user_version = ${SCHEMA_VERSION + 1}`);
    await expect(migrate(db)).rejects.toThrow(/newer than supported/);
  });

  it('creates the core tables', async () => {
    const db = await freshDb();
    const rows = await db.getAllAsync<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
    );
    const names = rows.map((r) => r.name);
    for (const table of [
      'accounts',
      'folders',
      'threads',
      'messages',
      'attachments',
      'notification_rules',
      'notification_events',
      'drafts',
      'pending_operations',
      'messages_fts',
      'app_settings',
    ]) {
      expect(names).toContain(table);
    }
  });

  it('keeps the full-text index in sync with messages', async () => {
    const db = await freshDb();
    await db.runAsync(
      `INSERT INTO messages (id, account_id, folder_id, thread_id, subject, body_text, sender_name, sender_address, received_at)
       VALUES ('m1', 'a1', 'f1', 't1', 'Invoice', 'please pay the quarterly invoice', 'Alice', 'alice@example.com', 1)`,
    );

    const hits = await db.getAllAsync<{ id: string }>(
      `SELECT m.id FROM messages_fts f JOIN messages m ON m.rowid = f.rowid WHERE messages_fts MATCH ?`,
      ['invoice'],
    );
    expect(hits.map((h) => h.id)).toEqual(['m1']);
  });
});
