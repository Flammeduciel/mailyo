import { GmailApiProvider } from '@/providers/gmail/gmail-api-provider';
import { bytesToBase64Url, utf8Encode, type GmailMessage } from '@/providers/gmail/gmail-codec';

const API = 'https://gmail.googleapis.com/gmail/v1/users/me';

function gmailMessage(id: string, internalDate: number, labels = ['INBOX']): GmailMessage {
  return {
    id,
    labelIds: labels,
    internalDate: String(internalDate),
    payload: {
      mimeType: 'text/plain',
      headers: [
        { name: 'From', value: 'alice@example.com' },
        { name: 'Subject', value: `Sujet ${id}` },
        { name: 'Message-ID', value: `<${id}@example.com>` },
      ],
      body: { data: bytesToBase64Url(utf8Encode(`Corps ${id}`)) },
    },
  };
}

interface Call {
  url: string;
  init: RequestInit;
}

/** Minimal Gmail API double: routes by URL, records every call. */
function fakeGmail(store: GmailMessage[], options: { unauthorizedOnce?: boolean } = {}) {
  const calls: Call[] = [];
  let unauthorized = options.unauthorizedOnce ?? false;

  const json = (status: number, body: unknown) =>
    ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response;

  const fetchImpl = jest.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = String(input);
    calls.push({ url, init });
    if (unauthorized) {
      unauthorized = false;
      return json(401, { error: { message: 'expired' } });
    }
    const path = url.slice(API.length);
    const get = path.match(/^\/messages\/([^/?]+)\?format=full$/);
    if (get) {
      return json(
        200,
        store.find((message) => message.id === get[1]),
      );
    }
    if (path.startsWith('/messages?')) {
      const params = new URLSearchParams(path.split('?')[1]);
      const label = params.get('labelIds');
      const after = params.get('q')?.match(/after:(\d+)/)?.[1];
      const rfc = params.get('q')?.match(/rfc822msgid:(.+)/)?.[1];
      const matching = store
        .filter((message) => (label ? message.labelIds?.includes(label) : true))
        .filter((message) => (after ? Number(message.internalDate) / 1000 > Number(after) : true))
        .filter((message) => (rfc ? `${message.id}@example.com` === rfc : true))
        .sort((a, b) => Number(b.internalDate) - Number(a.internalDate))
        .slice(0, Number(params.get('maxResults') ?? 100));
      return json(200, { messages: matching.map((message) => ({ id: message.id })) });
    }
    if (path === '/messages/send') {
      return json(200, { id: 'sent-1' });
    }
    if (/\/messages\/[^/]+\/(modify|trash)$/.test(path)) {
      return json(200, {});
    }
    return json(404, { error: { message: `unexpected ${path}` } });
  });

  return { fetchImpl: fetchImpl as unknown as typeof fetch, calls };
}

function provider(
  fetchImpl: typeof fetch,
  lookup: (uid: number) => Promise<string | null> = async () => null,
) {
  const getAccessToken = jest.fn(async (force?: boolean) => (force ? 'fresh-token' : 'token'));
  return {
    getAccessToken,
    gmail: new GmailApiProvider({
      emailAddress: 'moi@gmail.com',
      getAccessToken,
      lookupMessageIdHeader: lookup,
      fetchImpl,
    }),
  };
}

describe('GmailApiProvider', () => {
  const store = [
    gmailMessage('m1', 1_700_000_001_000),
    gmailMessage('m2', 1_700_000_002_000),
    gmailMessage('m3', 1_700_000_003_000),
    gmailMessage('s1', 1_700_000_004_000, ['SENT']),
  ];

  it('initial sync returns the newest messages of the label, ascending', async () => {
    const { fetchImpl } = fakeGmail(store);
    const { gmail } = provider(fetchImpl);

    const result = await gmail.fetchMessages({
      folderRemoteId: 'INBOX',
      knownUidValidity: null,
      lastSyncedUid: null,
      limit: 2,
    });

    expect(result.uidValidity).toBe(1);
    expect(result.messages.map((message) => message.subject)).toEqual(['Sujet m2', 'Sujet m3']);
  });

  it('incremental sync returns only messages after the cursor, oldest first', async () => {
    const { fetchImpl } = fakeGmail(store);
    const { gmail } = provider(fetchImpl);

    const result = await gmail.fetchMessages({
      folderRemoteId: 'INBOX',
      knownUidValidity: 1,
      lastSyncedUid: 1_700_000_001_000,
      limit: 1,
    });

    expect(result.messages.map((message) => message.remoteUid)).toEqual([1_700_000_002_000]);
  });

  it('refreshes the token once and retries on 401', async () => {
    const { fetchImpl, calls } = fakeGmail(store, { unauthorizedOnce: true });
    const { gmail, getAccessToken } = provider(fetchImpl);

    await gmail.fetchMessages({
      folderRemoteId: 'SENT',
      knownUidValidity: null,
      lastSyncedUid: null,
    });

    expect(getAccessToken).toHaveBeenCalledWith(true);
    expect((calls[1].init.headers as Record<string, string>).Authorization).toBe(
      'Bearer fresh-token',
    );
  });

  it('uses the Gmail id seen during fetch for label changes', async () => {
    const { fetchImpl, calls } = fakeGmail(store);
    const { gmail } = provider(fetchImpl);
    await gmail.fetchMessages({
      folderRemoteId: 'INBOX',
      knownUidValidity: null,
      lastSyncedUid: null,
    });

    await gmail.setRead(1_700_000_002_000, true);

    const modify = calls.at(-1)!;
    expect(modify.url).toBe(`${API}/messages/m2/modify`);
    expect(JSON.parse(String(modify.init.body))).toEqual({
      addLabelIds: [],
      removeLabelIds: ['UNREAD'],
    });
  });

  it('recovers the Gmail id from the stored Message-ID after a restart', async () => {
    const { fetchImpl, calls } = fakeGmail(store);
    const { gmail } = provider(fetchImpl, async () => '<m3@example.com>');

    await gmail.moveToTrash(1_700_000_003_000);

    expect(calls.at(-1)!.url).toBe(`${API}/messages/m3/trash`);
  });

  it('sends a raw message and reports ambiguous on a network failure', async () => {
    const { fetchImpl, calls } = fakeGmail(store);
    const { gmail } = provider(fetchImpl);
    const outgoing = {
      to: [{ name: 'A', address: 'a@example.com' }],
      cc: [],
      bcc: [],
      subject: 'Hi',
      bodyText: 'Yo',
    };

    await expect(gmail.send(outgoing)).resolves.toEqual({ status: 'sent', remoteId: 'sent-1' });
    expect(JSON.parse(String(calls.at(-1)!.init.body)).raw).toEqual(expect.any(String));

    const failing = provider((async () => {
      throw new TypeError('Network request failed');
    }) as unknown as typeof fetch);
    await expect(failing.gmail.send(outgoing)).resolves.toMatchObject({ status: 'ambiguous' });
  });
});
