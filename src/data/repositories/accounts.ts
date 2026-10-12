/**
 * Account repository.
 *
 * Row mapping is explicit: SQLite stores booleans as 0/1 and snake_case columns,
 * while the domain models use camelCase and real booleans.
 */

import type { Database, SqlValue } from '@/data/db/database';
import type { Account, AuthType, ProviderId, SyncStatus } from '@/domain/models';

interface AccountRow {
  id: string;
  provider: string;
  email_address: string;
  display_name: string;
  auth_type: string;
  sync_enabled: number;
  last_sync_at: number | null;
  sync_status: string;
  created_at: number;
}

function mapAccount(row: AccountRow): Account {
  return {
    id: row.id,
    provider: row.provider as ProviderId,
    emailAddress: row.email_address,
    displayName: row.display_name,
    authType: row.auth_type as AuthType,
    syncEnabled: row.sync_enabled !== 0,
    lastSyncAt: row.last_sync_at,
    syncStatus: row.sync_status as SyncStatus,
    createdAt: row.created_at,
  };
}

export async function insertAccount(db: Database, account: Account): Promise<void> {
  await db.runAsync(
    `INSERT INTO accounts
       (id, provider, email_address, display_name, auth_type, sync_enabled, last_sync_at, sync_status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      account.id,
      account.provider,
      account.emailAddress,
      account.displayName,
      account.authType,
      account.syncEnabled ? 1 : 0,
      account.lastSyncAt,
      account.syncStatus,
      account.createdAt,
    ],
  );
}

export async function getAccount(db: Database, id: string): Promise<Account | null> {
  const row = await db.getFirstAsync<AccountRow>('SELECT * FROM accounts WHERE id = ?', [id]);
  return row ? mapAccount(row) : null;
}

export async function listAccounts(db: Database): Promise<Account[]> {
  const rows = await db.getAllAsync<AccountRow>('SELECT * FROM accounts ORDER BY created_at ASC');
  return rows.map(mapAccount);
}

export async function updateAccountSyncStatus(
  db: Database,
  id: string,
  status: SyncStatus,
  lastSyncAt: number | null,
): Promise<void> {
  await db.runAsync('UPDATE accounts SET sync_status = ?, last_sync_at = ? WHERE id = ?', [
    status,
    lastSyncAt,
    id,
  ]);
}

export async function setAccountSyncEnabled(
  db: Database,
  id: string,
  enabled: boolean,
): Promise<void> {
  await db.runAsync('UPDATE accounts SET sync_enabled = ? WHERE id = ?', [enabled ? 1 : 0, id]);
}

/**
 * Delete an account and every row that belongs to it.
 *
 * There are no `ON DELETE CASCADE` foreign keys in the schema, so the cascade is
 * performed explicitly. Child rows that reference messages are removed before
 * the messages themselves.
 */
export async function deleteAccount(db: Database, id: string): Promise<void> {
  const params: SqlValue[] = [id];
  await db.runAsync(
    `DELETE FROM notification_events
     WHERE message_id IN (SELECT id FROM messages WHERE account_id = ?)`,
    params,
  );
  await db.runAsync(
    `DELETE FROM attachments
     WHERE message_id IN (SELECT id FROM messages WHERE account_id = ?)`,
    params,
  );
  await db.runAsync('DELETE FROM messages WHERE account_id = ?', params);
  await db.runAsync('DELETE FROM threads WHERE account_id = ?', params);
  await db.runAsync('DELETE FROM folders WHERE account_id = ?', params);
  await db.runAsync('DELETE FROM notification_rules WHERE account_id = ?', params);
  await db.runAsync('DELETE FROM drafts WHERE account_id = ?', params);
  await db.runAsync('DELETE FROM pending_operations WHERE account_id = ?', params);
  await db.runAsync('DELETE FROM accounts WHERE id = ?', params);
}
