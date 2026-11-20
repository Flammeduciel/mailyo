import { insertAccount } from '@/data/repositories/accounts';
import { listFolders } from '@/data/repositories/folders';
import { createMigratedDatabase } from '@/data/repositories/test-utils';
import { listThreadSummaries } from '@/data/repositories/threads';
import { createDemoProvider } from '@/providers/demo/demo-data';
import { MockMailProvider } from '@/providers/mock/mock-mail-provider';
import type { RemoteMessage } from '@/providers/types';
import {
  INITIAL_LIMIT,
  INITIAL_WINDOW_MS,
  SyncCancelledError,
  SyncEngine,
} from '@/sync/sync-engine';

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

describe('SyncEngine windows and UIDs', () => {
  const account = {
    id: 'acc',
    provider: 'gmail' as const,
    emailAddress: 'moi@gmail.com',
    displayName: 'Moi',
    authType: 'oauth' as const,
    syncEnabled: true,
    lastSyncAt: null,
    syncStatus: 'idle' as const,
    createdAt: NOW,
  };
  const remote = (uid: number, id = `m${uid}`): RemoteMessage => ({
    remoteUid: uid,
    folderRemoteId: 'INBOX',
    messageIdHeader: `<${id}@x.fr>`,
    inReplyTo: null,
    referencesHeader: null,
    senderName: 'Awa',
    senderAddress: 'awa@x.fr',
    to: [],
    cc: [],
    subject: `Sujet ${id}`,
    bodyText: 'Bonjour',
    bodyHtml: null,
    receivedAt: uid,
    isRead: false,
    isStarred: false,
    hasAttachments: false,
  });

  async function engineWith(messages: RemoteMessage[], providerId: 'gmail' | 'imap' = 'gmail') {
    const db = await createMigratedDatabase();
    await insertAccount(db, { ...account, provider: providerId });
    const provider = new MockMailProvider({
      emailAddress: account.emailAddress,
      provider: providerId,
      messages,
    });
    const fetchSpy = jest.spyOn(provider, 'fetchMessages');
    const engine = new SyncEngine({ db, provider, now: () => NOW });
    return { db, provider, engine, fetchSpy };
  }

  it('asks the last 30 days on the first sync, and none of it counts as new', async () => {
    const { engine, provider, fetchSpy } = await engineWith([remote(1), remote(2)]);
    const first = await engine.syncAccount({ ...account });
    expect(fetchSpy.mock.calls[0][0]).toMatchObject({
      lastSyncedUid: null,
      limit: INITIAL_LIMIT,
      sinceMs: NOW - INITIAL_WINDOW_MS,
    });
    expect(first.fetchedCount).toBe(2);
    expect(first.added).toEqual([]);

    provider.deliverRemote(remote(3));
    const next = await engine.syncAccount({ ...account });
    expect(next.added.map((m) => m.remoteUid)).toEqual([3]);
  });

  it('shifts a Gmail mail landing on a UID already taken (restored from the trash)', async () => {
    const { db, engine } = await engineWith([remote(5, 'a')]);
    await engine.syncAccount({ ...account });
    const [folder] = await listFolders(db, account.id);
    await engine.storeMessages({ ...account }, folder, [remote(5, 'b')]);
    const rows = await db.getAllAsync<{ remote_uid: number }>(
      'SELECT remote_uid FROM messages ORDER BY remote_uid',
    );
    expect(rows.map((r) => r.remote_uid)).toEqual([5, 6]);
  });

  it('replaces a stale IMAP copy holding the same UID', async () => {
    const { db, engine } = await engineWith([remote(5, 'a')], 'imap');
    await engine.syncAccount({ ...account, provider: 'imap' });
    const [folder] = await listFolders(db, account.id);
    await engine.storeMessages({ ...account, provider: 'imap' }, folder, [remote(5, 'b')]);
    const rows = await db.getAllAsync<{ subject: string }>('SELECT subject FROM messages');
    expect(rows.map((r) => r.subject)).toEqual(['Sujet b']);
  });
});
