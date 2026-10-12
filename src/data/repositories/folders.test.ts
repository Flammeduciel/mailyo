import type { Database } from '@/data/db/database';
import {
  getFolderByRole,
  listFolders,
  updateFolderSyncCursor,
  upsertFolder,
} from '@/data/repositories/folders';
import { createMigratedDatabase } from '@/data/repositories/test-utils';
import type { Folder } from '@/domain/models';

function folder(overrides: Partial<Folder> = {}): Folder {
  return {
    id: 'fold_1',
    accountId: 'acc_1',
    remoteFolderId: 'INBOX',
    name: 'Inbox',
    role: 'inbox',
    lastUidValidity: 1,
    lastSyncedUid: 5,
    ...overrides,
  };
}

describe('folders repository', () => {
  let db: Database;

  beforeEach(async () => {
    db = await createMigratedDatabase();
  });

  it('round-trips a folder including nullable numbers', async () => {
    await upsertFolder(db, folder({ lastUidValidity: null, lastSyncedUid: null }));

    expect(await getFolderByRole(db, 'acc_1', 'inbox')).toEqual(
      folder({ lastUidValidity: null, lastSyncedUid: null }),
    );
  });

  it('upserts idempotently without duplicating', async () => {
    await upsertFolder(db, folder());
    await upsertFolder(db, folder({ name: 'Boîte', lastSyncedUid: 42 }));

    const folders = await listFolders(db, 'acc_1');
    expect(folders).toHaveLength(1);
    expect(folders[0].name).toBe('Boîte');
    expect(folders[0].lastSyncedUid).toBe(42);
  });

  it('filters by account and role', async () => {
    await upsertFolder(db, folder());
    await upsertFolder(db, folder({ id: 'fold_2', accountId: 'acc_2', role: 'sent' }));

    expect(await listFolders(db, 'acc_1')).toHaveLength(1);
    expect(await getFolderByRole(db, 'acc_1', 'sent')).toBeNull();
    expect(await getFolderByRole(db, 'acc_2', 'sent')).not.toBeNull();
  });

  it('updates the sync cursor', async () => {
    await upsertFolder(db, folder());
    await updateFolderSyncCursor(db, 'fold_1', 7, 99);

    const loaded = await getFolderByRole(db, 'acc_1', 'inbox');
    expect(loaded?.lastUidValidity).toBe(7);
    expect(loaded?.lastSyncedUid).toBe(99);
  });
});
