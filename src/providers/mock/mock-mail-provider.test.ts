import { MockMailProvider } from '@/providers/mock/mock-mail-provider';
import type { OutgoingMessage, RemoteMessage } from '@/providers/types';

function remoteMessage(overrides: Partial<RemoteMessage> = {}): RemoteMessage {
  const uid = overrides.remoteUid ?? 1;
  return {
    remoteUid: uid,
    folderRemoteId: 'INBOX',
    messageIdHeader: `<m${uid}@example.com>`,
    inReplyTo: null,
    referencesHeader: null,
    senderName: 'Alice',
    senderAddress: 'alice@example.com',
    to: [{ name: 'Demo', address: 'demo@wouah-mail.app' }],
    cc: [],
    subject: 'Sujet',
    bodyText: 'Corps',
    bodyHtml: null,
    receivedAt: 1_700_000_000_000 + uid * 1000,
    isRead: false,
    isStarred: false,
    hasAttachments: false,
    ...overrides,
  };
}

const outgoing: OutgoingMessage = {
  to: [{ name: 'Alice', address: 'alice@example.com' }],
  cc: [],
  bcc: [],
  subject: 'Re: Sujet',
  bodyText: 'Bonjour',
};

function inboxFetch(
  provider: MockMailProvider,
  knownUidValidity: number | null,
  lastSyncedUid: number | null,
  limit?: number,
) {
  return provider.fetchMessages({
    folderRemoteId: 'INBOX',
    knownUidValidity,
    lastSyncedUid,
    limit,
  });
}

describe('MockMailProvider', () => {
  it('exposes the configured identity and a default inbox folder', async () => {
    const provider = new MockMailProvider({
      emailAddress: 'demo@wouah-mail.app',
      provider: 'gmail',
    });

    expect(provider.id).toBe('gmail');
    expect(provider.emailAddress).toBe('demo@wouah-mail.app');
    await expect(provider.listFolders()).resolves.toEqual([
      { remoteFolderId: 'INBOX', name: 'Boîte de réception', role: 'inbox' },
    ]);
  });

  it('falls back to the mock provider id when none is given', () => {
    expect(new MockMailProvider({ emailAddress: 'demo@wouah-mail.app' }).id).toBe('mock');
  });

  it('returns the initial fetch sorted by remoteUid ascending', async () => {
    const provider = new MockMailProvider({
      emailAddress: 'demo@wouah-mail.app',
      uidValidity: 7,
      messages: [
        remoteMessage({ remoteUid: 3 }),
        remoteMessage({ remoteUid: 1 }),
        remoteMessage({ remoteUid: 2 }),
      ],
    });

    const result = await inboxFetch(provider, null, null);
    expect(result.uidValidity).toBe(7);
    expect(result.messages.map((m) => m.remoteUid)).toEqual([1, 2, 3]);
  });

  it('returns only messages above lastSyncedUid on a differential fetch', async () => {
    const provider = new MockMailProvider({
      emailAddress: 'demo@wouah-mail.app',
      messages: [
        remoteMessage({ remoteUid: 1 }),
        remoteMessage({ remoteUid: 2 }),
        remoteMessage({ remoteUid: 3 }),
      ],
    });

    const result = await inboxFetch(provider, 1, 2);
    expect(result.messages.map((m) => m.remoteUid)).toEqual([3]);
  });

  it('honours the limit after sorting', async () => {
    const provider = new MockMailProvider({
      emailAddress: 'demo@wouah-mail.app',
      messages: [
        remoteMessage({ remoteUid: 3 }),
        remoteMessage({ remoteUid: 1 }),
        remoteMessage({ remoteUid: 2 }),
      ],
    });

    const result = await inboxFetch(provider, null, null, 2);
    expect(result.messages.map((m) => m.remoteUid)).toEqual([1, 2]);
  });

  it('re-fetches everything when the known UIDVALIDITY differs', async () => {
    const provider = new MockMailProvider({
      emailAddress: 'demo@wouah-mail.app',
      uidValidity: 1,
      messages: [
        remoteMessage({ remoteUid: 1 }),
        remoteMessage({ remoteUid: 2 }),
        remoteMessage({ remoteUid: 3 }),
      ],
    });

    const before = await inboxFetch(provider, 1, 2);
    expect(before.messages.map((m) => m.remoteUid)).toEqual([3]);

    provider.setUidValidity(2);
    const after = await inboxFetch(provider, 1, 2);
    expect(after.uidValidity).toBe(2);
    expect(after.messages.map((m) => m.remoteUid)).toEqual([1, 2, 3]);
  });

  it('records sends and returns an incrementing remoteId', async () => {
    const provider = new MockMailProvider({ emailAddress: 'demo@wouah-mail.app' });

    await expect(provider.send(outgoing)).resolves.toEqual({ status: 'sent', remoteId: 'sent-1' });
    await expect(provider.send(outgoing)).resolves.toEqual({ status: 'sent', remoteId: 'sent-2' });
    expect(provider.sentMessages).toEqual([outgoing, outgoing]);
  });

  it('reports a failed send when the next status is forced to failed', async () => {
    const provider = new MockMailProvider({ emailAddress: 'demo@wouah-mail.app' });
    provider.setNextSendStatus('failed');

    const result = await provider.send(outgoing);
    expect(result.status).toBe('failed');
    expect(result.error).toBeTruthy();
    expect(provider.sentMessages).toHaveLength(1);

    // The override is one-shot: the next send succeeds again.
    await expect(provider.send(outgoing)).resolves.toMatchObject({ status: 'sent' });
  });

  it('notifies watchers when a message is delivered remotely', async () => {
    const provider = new MockMailProvider({ emailAddress: 'demo@wouah-mail.app' });
    const onHint = jest.fn();
    const unsubscribe = provider.watch(onHint);

    provider.deliverRemote(remoteMessage({ remoteUid: 42 }));
    expect(onHint).toHaveBeenCalledTimes(1);
    const result = await inboxFetch(provider, null, null);
    expect(result.messages.map((m) => m.remoteUid)).toEqual([42]);

    unsubscribe();
    provider.deliverRemote(remoteMessage({ remoteUid: 43 }));
    expect(onHint).toHaveBeenCalledTimes(1);
  });

  it('excludes a message from its folder after moveToTrash', async () => {
    const provider = new MockMailProvider({
      emailAddress: 'demo@wouah-mail.app',
      messages: [remoteMessage({ remoteUid: 1 }), remoteMessage({ remoteUid: 2 })],
    });

    await provider.moveToTrash(1);
    const result = await inboxFetch(provider, null, null);
    expect(result.messages.map((m) => m.remoteUid)).toEqual([2]);
  });

  it('reflects setRead and star on subsequent fetches', async () => {
    const provider = new MockMailProvider({
      emailAddress: 'demo@wouah-mail.app',
      messages: [remoteMessage({ remoteUid: 1 })],
    });

    await provider.setRead(1, true);
    await provider.star(1, true);
    const [{ isRead, isStarred }] = (await inboxFetch(provider, null, null)).messages;
    expect(isRead).toBe(true);
    expect(isStarred).toBe(true);
  });
});
