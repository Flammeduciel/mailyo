import { createMigratedDatabase } from '@/data/repositories/test-utils';
import type { Notifier } from '@/notifications/notifier';
import { DEMO_ACCOUNT_ID } from '@/providers/demo/demo-data';
import { ProviderRegistry } from '@/providers/registry';
import type { FetchChangesInput, MailProvider, RemoteChange } from '@/providers/types';
import { MailService } from '@/services/mail-service';

const NOW = Date.UTC(2026, 0, 13, 9, 0);

/** Demo account whose provider reports `changes` (Gmail-style, by provider id). */
async function setup() {
  const db = await createMigratedDatabase();
  const registry = new ProviderRegistry();
  const dismissThread = jest.fn(async () => undefined);
  const service = new MailService({
    db,
    now: () => NOW,
    registry,
    notifier: { present: jest.fn(), dismissThread } as unknown as Notifier,
  });
  await service.connectDemo();
  const provider = registry.get(DEMO_ACCOUNT_ID) as MailProvider;
  const feed: { changes: RemoteChange[]; calls: FetchChangesInput[] } = { changes: [], calls: [] };
  provider.fetchChanges = async (input) => {
    feed.calls.push(input);
    const changes = feed.changes;
    feed.changes = [];
    return { cursor: String(feed.calls.length), changes };
  };
  // Give every stored mail a provider id: « g- » + its local id.
  await db.runAsync("UPDATE messages SET provider_message_id = 'g-' || id");
  const account = (await service.listAccounts())[0];
  return { db, service, provider, feed, account, dismissThread };
}

async function unreadThread(service: MailService) {
  const threads = await service.listConversations();
  const thread = threads.find((t) => t.unreadCount > 0) ?? threads[0];
  const messages = await service.getThreadMessages(thread.id);
  return { thread, messages };
}

describe('changes made elsewhere', () => {
  it('marks a conversation read elsewhere as read here and removes its notification', async () => {
    const { service, provider, feed, account, dismissThread } = await setup();
    const { thread, messages } = await unreadThread(service);
    feed.changes = messages.map((m) => ({ providerMessageId: `g-${m.id}`, isRead: true }));

    expect(await service.applyRemoteChanges(account, provider)).toBeGreaterThan(0);

    const after = (await service.listConversations()).find((t) => t.id === thread.id);
    expect(after?.unreadCount).toBe(0);
    expect((dismissThread.mock.calls as unknown as [string][]).map((c) => c[0])).toContain(
      thread.id,
    );
  });

  it('removes mail deleted elsewhere and keeps the cursor for next time', async () => {
    const { service, provider, feed, account } = await setup();
    const { thread, messages } = await unreadThread(service);
    feed.changes = messages.map((m) => ({ providerMessageId: `g-${m.id}`, removed: true }));

    await service.applyRemoteChanges(account, provider);
    expect((await service.listConversations()).some((t) => t.id === thread.id)).toBe(false);

    await service.applyRemoteChanges(account, provider);
    expect(feed.calls.map((c) => c.cursor)).toEqual([null, '1']);
  });

  it('follows stars and archiving done in Gmail', async () => {
    const { service, provider, feed, account } = await setup();
    const { thread, messages } = await unreadThread(service);
    feed.changes = [{ providerMessageId: `g-${messages[0].id}`, isStarred: true, inInbox: false }];

    await service.applyRemoteChanges(account, provider);

    const starred = await service.getThreadMessages(thread.id);
    expect(starred[0].isStarred).toBe(true);
    expect((await service.listConversations()).some((t) => t.id === thread.id)).toBe(false);
    expect(
      (await service.listConversations({ archivedOnly: true })).some((t) => t.id === thread.id),
    ).toBe(true);
  });

  it('never fails the sync when the provider is unreachable', async () => {
    const { service, provider, account } = await setup();
    provider.fetchChanges = async () => {
      throw new Error('offline');
    };
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    await expect(service.applyRemoteChanges(account, provider)).resolves.toBe(0);
    warn.mockRestore();
  });
});

describe('mailbox counters from the provider', () => {
  it('uses the provider unread numbers for the inbox tabs', async () => {
    const { service, provider } = await setup();
    provider.fetchMailboxCounts = async () => ({
      all: { unread: 42 },
      primary: { unread: 7 },
      social: { unread: 1 },
      promotions: { unread: 30 },
      updates: { unread: 4 },
      forums: { unread: 0 },
      spam: { unread: 3 },
    });
    await service.syncAll();
    const counts = await service.countMailboxes();
    expect(counts.all.unread).toBe(42);
    expect(counts.primary.unread).toBe(7);
    expect(counts.spam).toEqual({ total: 3, unread: 3 });
  });
});

describe('emptying the trash', () => {
  it('tells which accounts cannot be emptied from the app', async () => {
    const { service, provider } = await setup();
    provider.listTrash = async () => [];
    expect(await service.emptyTrashSupport()).toEqual({
      supported: [],
      unsupported: ['demo@wouah-mail.app'],
    });
    provider.emptyTrash = async () => 3;
    expect(await service.emptyTrash()).toEqual({ deleted: 3, unsupported: [] });
  });
});
