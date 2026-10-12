import * as SecureStore from 'expo-secure-store';

import { SecureTokenStore } from '@/providers/oauth/secure-token-store';
import type { OAuthTokens } from '@/providers/types';

const tokens: OAuthTokens = {
  accessToken: 'access-123',
  refreshToken: 'refresh-456',
  expiresAt: 1_800_000_000_000,
  scope: 'https://mail.google.com/',
  tokenType: 'bearer',
};

describe('SecureTokenStore', () => {
  it('stores and loads tokens through expo-secure-store under the documented key', async () => {
    const store = new SecureTokenStore();

    await store.save('acc_1', tokens);

    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
      'mailyo.tokens.acc_1',
      JSON.stringify(tokens),
    );
    await expect(store.load('acc_1')).resolves.toEqual(tokens);
  });

  it('round-trips a null refresh token and expiry', async () => {
    const store = new SecureTokenStore();
    const anonymous: OAuthTokens = {
      accessToken: 'access-only',
      refreshToken: null,
      expiresAt: null,
    };

    await store.save('acc_2', anonymous);
    await expect(store.load('acc_2')).resolves.toEqual(anonymous);
  });

  it('returns null when no tokens are stored', async () => {
    const store = new SecureTokenStore();
    await expect(store.load('missing')).resolves.toBeNull();
  });

  it('removes stored tokens', async () => {
    const store = new SecureTokenStore();
    await store.save('acc_3', tokens);

    await store.remove('acc_3');

    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('mailyo.tokens.acc_3');
    await expect(store.load('acc_3')).resolves.toBeNull();
  });
});
