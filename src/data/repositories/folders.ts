/**
 * Folder repository.
 */

import type { Database } from '@/data/db/database';
import type { Folder, FolderRole } from '@/domain/models';

interface FolderRow {
  id: string;
  account_id: string;
  remote_folder_id: string;
  name: string;
  role: string;
  last_uid_validity: number | null;
  last_synced_uid: number | null;
}

function mapFolder(row: FolderRow): Folder {
  return {
    id: row.id,
    accountId: row.account_id,
    remoteFolderId: row.remote_folder_id,
    name: row.name,
    role: row.role as FolderRole,
    lastUidValidity: row.last_uid_validity,
    lastSyncedUid: row.last_synced_uid,
  };
}

export async function upsertFolder(db: Database, folder: Folder): Promise<void> {
  await db.runAsync(
    `INSERT INTO folders
       (id, account_id, remote_folder_id, name, role, last_uid_validity, last_synced_uid)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       account_id = excluded.account_id,
       remote_folder_id = excluded.remote_folder_id,
       name = excluded.name,
       role = excluded.role,
       last_uid_validity = excluded.last_uid_validity,
       last_synced_uid = excluded.last_synced_uid`,
    [
      folder.id,
      folder.accountId,
      folder.remoteFolderId,
      folder.name,
      folder.role,
      folder.lastUidValidity,
      folder.lastSyncedUid,
    ],
  );
}

export async function listFolders(db: Database, accountId: string): Promise<Folder[]> {
  const rows = await db.getAllAsync<FolderRow>(
    'SELECT * FROM folders WHERE account_id = ? ORDER BY name ASC',
    [accountId],
  );
  return rows.map(mapFolder);
}

export async function getFolderByRole(
  db: Database,
  accountId: string,
  role: FolderRole,
): Promise<Folder | null> {
  const row = await db.getFirstAsync<FolderRow>(
    'SELECT * FROM folders WHERE account_id = ? AND role = ? LIMIT 1',
    [accountId, role],
  );
  return row ? mapFolder(row) : null;
}

export async function updateFolderSyncCursor(
  db: Database,
  folderId: string,
  uidValidity: number,
  lastSyncedUid: number,
): Promise<void> {
  await db.runAsync('UPDATE folders SET last_uid_validity = ?, last_synced_uid = ? WHERE id = ?', [
    uidValidity,
    lastSyncedUid,
    folderId,
  ]);
}
