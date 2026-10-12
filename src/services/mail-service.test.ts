/**
 * Application service tests.
 *
 * Real SQLite (in-memory) + the deterministic `MockMailProvider` via
 * `connectDemo()`, so the whole receive → thread → notify → send path is covered
 * without a device.
 */

import { createMigratedDatabase } from '@/data/repositories/test-utils';
import { DEMO_ACCOUNT_ID } from '@/providers/demo/demo-data';
import { MailService } from '@/services/mail-service';

const NOW = Date.UTC(2026, 0, 13, 9, 0);

describe('MailService', () => {
  it('imports the demo conversations on connect', async () => {
    const { service } = await bootstrap();
    const threads = await service.listConversations();
    expect(threads.length).toBe(2);
    expect(await service.unreadCount()).toBe(2);
  });

  it('does not duplicate data when initialised again', async () => {
    const { service } = await bootstrap();
    await service.initialize();
    expect(await service.listConversations()).toHaveLength(2);
  });

  it('marks a thread read when it is opened', async () => {
    const { service } = await bootstrap();
    const [first] = await service.listConversations();
    expect(first.unreadCount).toBeGreaterThan(0);

    await service.openThread(first.id);

    const reloaded = (await service.listConversations()).find((t) => t.id === first.id);
    expect(reloaded?.unreadCount).toBe(0);
  });

  it('sends a message through the provider and stores it locally', async () => {
    const { service } = await bootstrap();

    const result = await service.send({
      accountId: DEMO_ACCOUNT_ID,
      to: 'nouveau@example.com',
      subject: 'Bonjour',
      body: 'Un petit message.',
    });

    expect(result.status).toBe('sent');
    const threads = await service.listConversations();
    expect(threads.some((t) => t.normalizedSubject === 'bonjour')).toBe(true);
  });

  it('archives a thread out of the conversation list', async () => {
    const { service } = await bootstrap();
    const [first] = await service.listConversations();

    await service.archiveThread(first.id);

    expect((await service.listConversations()).find((t) => t.id === first.id)).toBeUndefined();
    expect(await service.listConversations({ includeArchived: true })).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: first.id })]),
    );
  });

  it('finds messages with the FTS index', async () => {
    const { service } = await bootstrap();

    const hits = await service.search('facture');
    expect(hits.length).toBeGreaterThan(0);
    expect(await service.search('   ')).toEqual([]);
  });
});

async function bootstrap() {
  const db = await createMigratedDatabase();
  const service = new MailService({ db, now: () => NOW });
  await service.connectDemo();
  return { db, service };
}
