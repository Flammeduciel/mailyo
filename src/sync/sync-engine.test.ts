import { insertAccount } from '@/data/repositories/accounts';
import { listFolders } from '@/data/repositories/folders';
import { createMigratedDatabase } from '@/data/repositories/test-utils';
import { listThreadSummaries } from '@/data/repositories/threads';
import { createDemoProvider } from '@/providers/demo/demo-data';
import { SyncCancelledError, SyncEngine } from '@/sync/sync-engine';

const NOW = Date.UTC(2026, 0, 13, 9, 0);

describe('SyncEngine cancellation', () => {
  it('syncs normally while the account is kept', async () => {
    const db = await createMigratedDatabase();
    const demo = createDemoProvider(NOW);
    await insertAccount(db, demo.account);
    const engine = new SyncEngine({ db, provider: demo.provider, now: () => NOW });
    const result = await engine.syncAccount(demo.account);
    expect(result.fetchedCount).toBeGreaterThan(0);
  });

  it('stops before writing anything once the account is being removed', async () => {
    const db = await createMigratedDatabase();
    const demo = createDemoProvider(NOW);
    await insertAccount(db, demo.account);
    const engine = new SyncEngine({
      db,
      provider: demo.provider,
      now: () => NOW,
      isCancelled: () => true,
    });

    await expect(engine.syncAccount(demo.account)).rejects.toBeInstanceOf(SyncCancelledError);
    expect(await listFolders(db, demo.account.id)).toEqual([]);
    expect(await listThreadSummaries(db, { accountId: demo.account.id })).toEqual([]);
  });
});
