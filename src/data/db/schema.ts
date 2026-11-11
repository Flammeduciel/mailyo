/**
 * Local schema and versioned migrations (plan §15).
 *
 * Migrations are applied in order and tracked with `PRAGMA user_version`, so a
 * partially migrated database can be resumed safely. Every statement is
 * idempotent (`IF NOT EXISTS`) to keep recovery cheap.
 */

import type { Database } from '@/data/db/database';

export const SCHEMA_VERSION = 5;

const MIGRATION_1 = `
CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY NOT NULL,
  provider TEXT NOT NULL,
  email_address TEXT NOT NULL,
  display_name TEXT NOT NULL DEFAULT '',
  auth_type TEXT NOT NULL DEFAULT 'oauth',
  sync_enabled INTEGER NOT NULL DEFAULT 1,
  last_sync_at INTEGER,
  sync_status TEXT NOT NULL DEFAULT 'idle',
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS folders (
  id TEXT PRIMARY KEY NOT NULL,
  account_id TEXT NOT NULL,
  remote_folder_id TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'custom',
  last_uid_validity INTEGER,
  last_synced_uid INTEGER,
  UNIQUE (account_id, remote_folder_id)
);

CREATE TABLE IF NOT EXISTS threads (
  id TEXT PRIMARY KEY NOT NULL,
  account_id TEXT NOT NULL,
  normalized_subject TEXT NOT NULL DEFAULT '',
  last_message_at INTEGER NOT NULL DEFAULT 0,
  unread_count INTEGER NOT NULL DEFAULT 0,
  is_pinned INTEGER NOT NULL DEFAULT 0,
  is_archived INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY NOT NULL,
  account_id TEXT NOT NULL,
  folder_id TEXT NOT NULL,
  remote_uid INTEGER,
  message_id_header TEXT,
  in_reply_to TEXT,
  references_header TEXT,
  thread_id TEXT NOT NULL,
  sender_name TEXT NOT NULL DEFAULT '',
  sender_address TEXT NOT NULL DEFAULT '',
  to_json TEXT NOT NULL DEFAULT '[]',
  cc_json TEXT NOT NULL DEFAULT '[]',
  subject TEXT NOT NULL DEFAULT '',
  body_text TEXT NOT NULL DEFAULT '',
  body_html_sanitized TEXT,
  received_at INTEGER NOT NULL DEFAULT 0,
  is_read INTEGER NOT NULL DEFAULT 0,
  is_starred INTEGER NOT NULL DEFAULT 0,
  has_attachments INTEGER NOT NULL DEFAULT 0,
  sync_state TEXT NOT NULL DEFAULT 'synced'
);

CREATE TABLE IF NOT EXISTS attachments (
  id TEXT PRIMARY KEY NOT NULL,
  message_id TEXT NOT NULL,
  filename TEXT NOT NULL DEFAULT '',
  mime_type TEXT NOT NULL DEFAULT 'application/octet-stream',
  size_bytes INTEGER NOT NULL DEFAULT 0,
  remote_part_id TEXT,
  local_path TEXT,
  download_state TEXT NOT NULL DEFAULT 'remote'
);

CREATE TABLE IF NOT EXISTS notification_rules (
  id TEXT PRIMARY KEY NOT NULL,
  account_id TEXT,
  match_type TEXT NOT NULL,
  match_value TEXT NOT NULL DEFAULT '',
  action TEXT NOT NULL DEFAULT 'notify',
  sound_id TEXT,
  vibration_mode TEXT NOT NULL DEFAULT 'default',
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS notification_events (
  id TEXT PRIMARY KEY NOT NULL,
  message_id TEXT NOT NULL,
  rule_id TEXT,
  notified_at INTEGER NOT NULL,
  result TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS drafts (
  id TEXT PRIMARY KEY NOT NULL,
  account_id TEXT NOT NULL,
  remote_draft_id TEXT,
  to_json TEXT NOT NULL DEFAULT '[]',
  cc_json TEXT NOT NULL DEFAULT '[]',
  bcc_json TEXT NOT NULL DEFAULT '[]',
  subject TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  updated_at INTEGER NOT NULL,
  sync_state TEXT NOT NULL DEFAULT 'pending'
);

CREATE TABLE IF NOT EXISTS pending_operations (
  id TEXT PRIMARY KEY NOT NULL,
  account_id TEXT NOT NULL,
  message_id TEXT,
  operation_type TEXT NOT NULL,
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL,
  retry_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  last_error TEXT
);

CREATE INDEX IF NOT EXISTS idx_messages_account ON messages (account_id);
CREATE INDEX IF NOT EXISTS idx_messages_folder ON messages (folder_id);
CREATE INDEX IF NOT EXISTS idx_messages_thread ON messages (thread_id);
CREATE INDEX IF NOT EXISTS idx_messages_received ON messages (received_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_read ON messages (account_id, is_read);
CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages (sender_address);
CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_remote
  ON messages (account_id, folder_id, remote_uid) WHERE remote_uid IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_threads_recent ON threads (account_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_threads_subject ON threads (account_id, normalized_subject);
CREATE INDEX IF NOT EXISTS idx_folders_account ON folders (account_id);
CREATE INDEX IF NOT EXISTS idx_rules_account ON notification_rules (account_id);
CREATE INDEX IF NOT EXISTS idx_events_message ON notification_events (message_id);
CREATE INDEX IF NOT EXISTS idx_pending_status ON pending_operations (status);
CREATE INDEX IF NOT EXISTS idx_attachments_message ON attachments (message_id);
`;

/**
 * Full-text search over messages (FTS5, external content table). The triggers
 * keep the index in sync with `messages` so repositories never write to FTS
 * directly.
 */
const MIGRATION_2 = `
CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5 (
  subject,
  body_text,
  sender_name,
  sender_address,
  content = 'messages',
  content_rowid = 'rowid',
  tokenize = 'unicode61 remove_diacritics 2'
);

CREATE TRIGGER IF NOT EXISTS messages_fts_ai AFTER INSERT ON messages BEGIN
  INSERT INTO messages_fts (rowid, subject, body_text, sender_name, sender_address)
  VALUES (new.rowid, new.subject, new.body_text, new.sender_name, new.sender_address);
END;

CREATE TRIGGER IF NOT EXISTS messages_fts_ad AFTER DELETE ON messages BEGIN
  INSERT INTO messages_fts (messages_fts, rowid, subject, body_text, sender_name, sender_address)
  VALUES ('delete', old.rowid, old.subject, old.body_text, old.sender_name, old.sender_address);
END;

CREATE TRIGGER IF NOT EXISTS messages_fts_au AFTER UPDATE ON messages BEGIN
  INSERT INTO messages_fts (messages_fts, rowid, subject, body_text, sender_name, sender_address)
  VALUES ('delete', old.rowid, old.subject, old.body_text, old.sender_name, old.sender_address);
  INSERT INTO messages_fts (rowid, subject, body_text, sender_name, sender_address)
  VALUES (new.rowid, new.subject, new.body_text, new.sender_name, new.sender_address);
END;
`;

/**
 * Key/value application settings (theme, notification content mode, default
 * sound, quiet hours, active account...). Deliberately a plain table rather than
 * a native KV store so preferences are covered by the same real-SQL tests as the
 * rest of the data layer.
 */
const MIGRATION_3 = `
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL
);
`;

/**
 * Provider category per message (Gmail tabs), used by the conversation tabs.
 * Sync cursors are reset so the latest messages are fetched again and
 * back-filled with their category (upserts are idempotent).
 */
const MIGRATION_4 = `
ALTER TABLE messages ADD COLUMN category TEXT;
CREATE INDEX IF NOT EXISTS idx_messages_thread_received ON messages (thread_id, received_at);
UPDATE folders SET last_synced_uid = NULL;
`;

/** List-Unsubscribe header, for the "Se désabonner" action. */
const MIGRATION_5 = `
ALTER TABLE messages ADD COLUMN list_unsubscribe TEXT;
`;

const MIGRATIONS: readonly string[] = [
  MIGRATION_1,
  MIGRATION_2,
  MIGRATION_3,
  MIGRATION_4,
  MIGRATION_5,
];

/** Apply every pending migration. Resumable and idempotent. */
export async function migrate(db: Database): Promise<void> {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  let version = row?.user_version ?? 0;

  if (version > SCHEMA_VERSION) {
    throw new Error(
      `Database schema version ${version} is newer than supported version ${SCHEMA_VERSION}.`,
    );
  }

  await db.execAsync('PRAGMA journal_mode = WAL');
  await db.execAsync('PRAGMA foreign_keys = ON');

  while (version < MIGRATIONS.length) {
    await db.execAsync(MIGRATIONS[version]);
    version += 1;
    await db.execAsync(`PRAGMA user_version = ${version}`);
  }
}
