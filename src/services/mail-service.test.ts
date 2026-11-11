/**
 * Application service tests.
 *
 * Real SQLite (in-memory) + the deterministic `MockMailProvider` via
 * `connectDemo()`, so the whole receive → thread → notify → send path is covered
 * without a device.
 */

import { insertAccount } from '@/data/repositories/accounts';
import { upsertMessage } from '@/data/repositories/messages';
import { upsertThread } from '@/data/repositories/threads';
import { createMigratedDatabase } from '@/data/repositories/test-utils';
import { DEMO_ACCOUNT_ID } from '@/providers/demo/demo-data';
import type { OAuthTokens, TokenStore } from '@/providers/types';
import { MailService } from '@/services/mail-service';

const NOW = Date.UTC(2026, 0, 13, 9, 0);

class FakeTokenStore implements TokenStore {
  readonly saved = new Map<string, OAuthTokens>();

  async save(accountId: string, tokens: OAuthTokens): Promise<void> {
    this.saved.set(accountId, tokens);
  }

  async load(accountId: string): Promise<OAuthTokens | null> {
    return this.saved.get(accountId) ?? null;
  }

  async remove(accountId: string): Promise<void> {
    this.saved.delete(accountId);
  }
}

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

describe('MailService OAuth accounts', () => {
  const tokens: OAuthTokens = {
    accessToken: 'access-token',
    refreshToken: 'refresh-token',
    expiresAt: NOW + 3_600_000,
  };

  async function oauthService() {
    const db = await createMigratedDatabase();
    const tokenStore = new FakeTokenStore();
    const service = new MailService({ db, now: () => NOW, tokenStore });
    return { db, tokenStore, service };
  }

  it('creates the account and stores its tokens', async () => {
    const { tokenStore, service } = await oauthService();

    const account = await service.connectOAuthAccount({
      emailAddress: 'utilisateur@gmail.com',
      tokens,
    });

    expect(account).toMatchObject({
      emailAddress: 'utilisateur@gmail.com',
      provider: 'gmail',
      authType: 'oauth',
    });
    expect(await service.listAccounts()).toEqual([account]);
    expect(await tokenStore.load(account.id)).toEqual(tokens);
  });

  it('reuses the existing account when the same address is authorised again', async () => {
    const { tokenStore, service } = await oauthService();
    const first = await service.connectOAuthAccount({ emailAddress: 'a@gmail.com', tokens });
    const renewed = { ...tokens, accessToken: 'renewed-access' };

    const second = await service.connectOAuthAccount({
      emailAddress: 'A@gmail.com',
      tokens: renewed,
    });

    expect(second.id).toBe(first.id);
    expect(await service.listAccounts()).toHaveLength(1);
    expect(await tokenStore.load(first.id)).toEqual(renewed);
  });

  it('creates a single account when the same address is authorised concurrently', async () => {
    const { service } = await oauthService();

    const [first, second] = await Promise.all([
      service.connectOAuthAccount({ emailAddress: 'a@gmail.com', tokens }),
      service.connectOAuthAccount({ emailAddress: 'a@gmail.com', tokens }),
    ]);

    expect(second.id).toBe(first.id);
    expect(await service.listAccounts()).toHaveLength(1);
  });

  it('removes duplicate accounts on load, keeping the one with tokens', async () => {
    const { db, tokenStore, service } = await oauthService();
    const base = {
      provider: 'gmail' as const,
      emailAddress: 'a@gmail.com',
      displayName: 'a@gmail.com',
      authType: 'oauth' as const,
      syncEnabled: true,
      lastSyncAt: null,
      syncStatus: 'idle' as const,
    };
    await insertAccount(db, { ...base, id: 'dup-1', createdAt: NOW });
    await insertAccount(db, { ...base, id: 'dup-2', createdAt: NOW + 1 });
    await insertAccount(db, { ...base, id: 'dup-3', emailAddress: 'A@gmail.com', createdAt: NOW + 2 });
    await tokenStore.save('dup-2', tokens);

    await service.loadState();

    expect((await service.listAccounts()).map((account) => account.id)).toEqual(['dup-2']);
  });

  it('merges conversations that were split by the old threading', async () => {
    const { db, service } = await oauthService();
    const account = await service.connectOAuthAccount({ emailAddress: 'moi@gmail.com', tokens });
    const mail = (
      id: string,
      threadId: string,
      minutes: number,
      headers: { inReplyTo?: string; references?: string },
    ) => ({
      id,
      accountId: account.id,
      folderId: 'inbox',
      remoteUid: minutes,
      messageIdHeader: `<${id}@x.com>`,
      inReplyTo: headers.inReplyTo ?? null,
      referencesHeader: headers.references ?? null,
      threadId,
      senderName: 'Benicia',
      senderAddress: 'benicia@gmail.com',
      to: [],
      cc: [],
      subject: id === 'root' ? 'Demande de machine' : 'Re: Demande de machine',
      bodyText: id,
      bodyHtmlSanitized: null,
      receivedAt: NOW + minutes * 60_000,
      isRead: true,
      isStarred: false,
      hasAttachments: false,
      syncState: 'synced' as const,
    });
    const split = [
      mail('root', `${account.id}::msg:a`, 1, {}),
      mail('r1', `${account.id}::${account.id}::msg:a`, 2, {
        inReplyTo: '<root@x.com>',
        references: '<root@x.com>',
      }),
      mail('r2', `${account.id}::${account.id}::${account.id}::msg:a`, 3, {
        inReplyTo: '<r1@x.com>',
        references: '<root@x.com> <r1@x.com>',
      }),
    ];
    for (const message of split) {
      await upsertThread(db, {
        id: message.threadId,
        accountId: account.id,
        normalizedSubject: 'demande de machine',
        lastMessageAt: message.receivedAt,
        unreadCount: 0,
        isPinned: false,
        isArchived: false,
      });
      await upsertMessage(db, message);
    }
    expect(await service.listConversations()).toHaveLength(3);

    await service.rethreadStoredMail();

    const conversations = await service.listConversations();
    expect(conversations).toHaveLength(1);
    expect(await service.getThreadMessages(conversations[0].id)).toHaveLength(3);
    expect(conversations[0].contact).toEqual({ name: 'Benicia', address: 'benicia@gmail.com' });
    expect(await service.getCorrespondence('Benicia@gmail.com')).toEqual({
      received: 3,
      sent: 0,
      firstAt: NOW + 60_000,
      lastAt: NOW + 3 * 60_000,
    });
  });

  it('synchronises a Gmail account through the Gmail API into conversations', async () => {
    const db = await createMigratedDatabase();
    const tokenStore = new FakeTokenStore();
    const body = btoa('Bonjour').replace(/=+$/, '');
    const inbox = {
      id: 'g1',
      labelIds: ['INBOX', 'UNREAD'],
      internalDate: String(NOW - 60_000),
      payload: {
        mimeType: 'text/plain',
        headers: [
          { name: 'From', value: 'Alice <alice@example.com>' },
          { name: 'Subject', value: 'Premier mail' },
          { name: 'Message-ID', value: '<g1@example.com>' },
        ],
        body: { data: body },
      },
    };
    const fetchImpl = (async (input: RequestInfo | URL) => {
      const url = String(input);
      const respond = (data: unknown) =>
        ({ ok: true, status: 200, json: async () => data }) as Response;
      if (url.includes('/messages/g1?format=full')) {
        return respond(inbox);
      }
      if (url.includes('labelIds=INBOX')) {
        return respond({ messages: [{ id: 'g1' }] });
      }
      return respond({});
    }) as unknown as typeof fetch;

    const service = new MailService({
      db,
      now: () => NOW,
      tokenStore,
      gmailClientId: 'client',
      fetchImpl,
    });
    await service.connectOAuthAccount({ emailAddress: 'moi@gmail.com', tokens });
    await service.syncAll();

    const conversations = await service.listConversations();
    expect(conversations).toHaveLength(1);
    expect(await service.unreadCount()).toBe(1);
    expect((await service.search('Bonjour'))[0]).toMatchObject({
      subject: 'Premier mail',
      senderAddress: 'alice@example.com',
    });
  });

  it('sorts Gmail mail into tabs and pages older history on demand', async () => {
    const db = await createMigratedDatabase();
    const mail = (id: string, minutesAgo: number, labels: string[]) => ({
      id,
      labelIds: ['INBOX', ...labels],
      internalDate: String(NOW - minutesAgo * 60_000),
      payload: {
        mimeType: 'text/plain',
        headers: [
          { name: 'From', value: `${id}@example.com` },
          { name: 'Subject', value: `Sujet ${id}` },
          { name: 'Message-ID', value: `<${id}@example.com>` },
        ],
        body: { data: btoa(id).replace(/=+$/, '') },
      },
    });
    const store = [
      mail('perso', 1, []),
      mail('promo', 2, ['CATEGORY_PROMOTIONS']),
      mail('liste', 3, ['CATEGORY_FORUMS', 'STARRED']),
      mail('ancien', 600, []),
    ];
    const fetchImpl = (async (input: RequestInfo | URL) => {
      const url = String(input);
      const respond = (data: unknown) =>
        ({ ok: true, status: 200, json: async () => data }) as Response;
      const get = url.match(/\/messages\/([^/?]+)\?format=full/);
      if (get) {
        return respond(store.find((message) => message.id === get[1]));
      }
      if (url.includes('labelIds=INBOX')) {
        const query = decodeURIComponent(url.match(/q=([^&]+)/)?.[1] ?? '');
        const before = Number(query.match(/before:(\d+)/)?.[1] ?? Infinity) * 1000;
        const max = Number(url.match(/maxResults=(\d+)/)?.[1] ?? 100);
        const ids = store
          .filter((message) => Number(message.internalDate) < before)
          .slice(0, max)
          .map((message) => ({ id: message.id }));
        return respond({ messages: ids });
      }
      return respond({});
    }) as unknown as typeof fetch;

    const service = new MailService({
      db,
      now: () => NOW,
      tokenStore: new FakeTokenStore(),
      gmailClientId: 'client',
      fetchImpl,
      fetchLimit: 3,
    });
    await service.connectOAuthAccount({ emailAddress: 'moi@gmail.com', tokens });
    await service.syncAll();

    const subjects = async (options: Parameters<MailService['listConversations']>[0]) =>
      (await service.listConversations(options)).map((thread) => thread.lastMessage.subject);

    expect(await subjects({ tab: 'discussions' })).toEqual(['Sujet perso']);
    expect(await subjects({ tab: 'actus' })).toEqual(['Sujet promo']);
    expect(await subjects({ tab: 'groupes' })).toEqual(['Sujet liste']);
    expect(await subjects({ tab: 'favoris' })).toEqual(['Sujet liste']);

    await expect(service.loadOlderConversations(10)).resolves.toBe(true);
    expect(await subjects({ tab: 'discussions' })).toEqual(['Sujet perso', 'Sujet ancien']);
    await expect(service.loadOlderConversations(10)).resolves.toBe(false);
  });

  it('keeps syncing other accounts when one Gmail account fails', async () => {
    const db = await createMigratedDatabase();
    const fetchImpl = (async () =>
      ({ ok: false, status: 500, json: async () => ({}) }) as Response) as unknown as typeof fetch;
    const service = new MailService({
      db,
      now: () => NOW,
      tokenStore: new FakeTokenStore(),
      gmailClientId: 'client',
      fetchImpl,
    });
    const account = await service.connectOAuthAccount({ emailAddress: 'moi@gmail.com', tokens });
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

    await expect(service.syncAll()).resolves.toBeUndefined();

    expect((await service.getAccountById(account.id))?.syncStatus).toBe('error');
    warn.mockRestore();
  });

  it('survives initialisation without a native provider', async () => {
    const { service } = await oauthService();
    const account = await service.connectOAuthAccount({ emailAddress: 'a@gmail.com', tokens });

    await expect(service.initialize()).resolves.toBeUndefined();

    expect(await service.listAccounts()).toEqual([account]);
  });

  it('removes the stored tokens when the account is deleted', async () => {
    const { tokenStore, service } = await oauthService();
    const account = await service.connectOAuthAccount({ emailAddress: 'a@gmail.com', tokens });

    await service.deleteAccountData(account.id);

    expect(await service.listAccounts()).toEqual([]);
    expect(await tokenStore.load(account.id)).toBeNull();
  });
});

async function bootstrap() {
  const db = await createMigratedDatabase();
  const service = new MailService({ db, now: () => NOW });
  await service.connectDemo();
  return { db, service };
}
