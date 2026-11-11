import { createGmailTokenProvider, GmailAuthError } from '@/providers/gmail/gmail-tokens';
import type { OAuthTokens, TokenStore } from '@/providers/types';

const NOW = 1_700_000_000_000;

class MemoryTokenStore implements TokenStore {
  readonly values = new Map<string, OAuthTokens>();
  async save(accountId: string, tokens: OAuthTokens) {
    this.values.set(accountId, tokens);
  }
  async load(accountId: string) {
    return this.values.get(accountId) ?? null;
  }
  async remove(accountId: string) {
    this.values.delete(accountId);
  }
}

function tokenResponse(status: number, body: unknown) {
  return jest.fn(
    async () => ({ ok: status === 200, status, json: async () => body }) as Response,
  ) as unknown as jest.Mock & typeof fetch;
}

function setup(tokens: OAuthTokens, fetchImpl: typeof fetch) {
  const tokenStore = new MemoryTokenStore();
  tokenStore.values.set('acc', tokens);
  const getToken = createGmailTokenProvider({
    accountId: 'acc',
    clientId: 'client-id',
    tokenStore,
    now: () => NOW,
    fetchImpl,
  });
  return { tokenStore, getToken };
}

describe('createGmailTokenProvider', () => {
  it('returns the stored token while it is still valid', async () => {
    const fetchImpl = tokenResponse(200, {});
    const { getToken } = setup(
      { accessToken: 'still-good', refreshToken: 'r', expiresAt: NOW + 10 * 60_000 },
      fetchImpl,
    );

    await expect(getToken()).resolves.toBe('still-good');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('refreshes an expiring token, keeps the refresh token and persists the result', async () => {
    const fetchImpl = tokenResponse(200, { access_token: 'new', expires_in: 3600 });
    const { getToken, tokenStore } = setup(
      { accessToken: 'old', refreshToken: 'r', expiresAt: NOW + 30_000 },
      fetchImpl,
    );

    await expect(getToken()).resolves.toBe('new');
    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(init.body).toBe('client_id=client-id&refresh_token=r&grant_type=refresh_token');
    expect(await tokenStore.load('acc')).toMatchObject({
      accessToken: 'new',
      refreshToken: 'r',
      expiresAt: NOW + 3_600_000,
    });
  });

  it('asks the user to reconnect when the grant was revoked or expired', async () => {
    const { getToken } = setup(
      { accessToken: 'old', refreshToken: 'r', expiresAt: NOW - 1 },
      tokenResponse(400, { error: 'invalid_grant' }),
    );

    await expect(getToken()).rejects.toBeInstanceOf(GmailAuthError);
  });

  it('shares one refresh between concurrent callers', async () => {
    const fetchImpl = tokenResponse(200, { access_token: 'new', expires_in: 3600 });
    const { getToken } = setup(
      { accessToken: 'old', refreshToken: 'r', expiresAt: NOW - 1 },
      fetchImpl,
    );

    await Promise.all([getToken(), getToken(), getToken()]);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
