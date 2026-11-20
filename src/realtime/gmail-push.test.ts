import {
  disableGmailPush,
  enableGmailPush,
  isGmailPushConfigured,
  parseRelayMessage,
} from '@/realtime/gmail-push';

const config = {
  relayUrl: 'https://relay.example.com/',
  topicName: 'projects/p/topics/gmail-push',
};
const account = { email: 'demo@gmail.com', accessToken: 'ya29.token' };

function recorder(status = 200) {
  const calls: { url: string; body: Record<string, unknown> | null; auth?: string }[] = [];
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    const headers = (init?.headers ?? {}) as Record<string, string>;
    calls.push({
      url,
      body: init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null,
      auth: headers.Authorization,
    });
    return new Response('{}', { status });
  }) as typeof fetch;
  return { calls, fetchImpl };
}

describe('gmail push', () => {
  it('watches the inbox, then registers the phone with the relay', async () => {
    const { calls, fetchImpl } = recorder();
    await enableGmailPush(account, 'fcm-token-123', config, fetchImpl);
    expect(calls.map((c) => c.url)).toEqual([
      'https://gmail.googleapis.com/gmail/v1/users/me/watch',
      'https://relay.example.com/register',
    ]);
    expect(calls[0].auth).toBe('Bearer ya29.token');
    expect(calls[0].body).toEqual(
      expect.objectContaining({ topicName: 'projects/p/topics/gmail-push', labelIds: ['INBOX'] }),
    );
    expect(calls[1].body).toEqual({
      email: 'demo@gmail.com',
      fcmToken: 'fcm-token-123',
      accessToken: 'ya29.token',
    });
  });

  it('reports a refused watch', async () => {
    const { fetchImpl } = recorder(403);
    await expect(enableGmailPush(account, 'fcm', config, fetchImpl)).rejects.toThrow('403');
  });

  it('unregisters without throwing even when offline', async () => {
    const fetchImpl = (async () => {
      throw new Error('offline');
    }) as typeof fetch;
    await expect(disableGmailPush(account, 'fcm', config, fetchImpl)).resolves.toBeUndefined();
  });

  it('parses the relay message, raw or as dataString', () => {
    expect(parseRelayMessage({ type: 'gmail', email: 'Demo@Gmail.com' })).toEqual({
      email: 'demo@gmail.com',
    });
    expect(parseRelayMessage({ dataString: '{"type":"gmail","email":"a@b.c"}' })).toEqual({
      email: 'a@b.c',
    });
    expect(parseRelayMessage({ type: 'other' })).toBeNull();
    expect(parseRelayMessage(null)).toBeNull();
  });

  it('needs both the relay URL and the topic', () => {
    expect(isGmailPushConfigured(config)).toBe(true);
    expect(isGmailPushConfigured({ relayUrl: 'x', topicName: '' })).toBe(false);
    expect(isGmailPushConfigured(undefined)).toBe(false);
  });
});
