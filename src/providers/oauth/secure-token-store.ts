/**
 * OAuth token storage backed by `expo-secure-store` (Android Keystore / iOS
 * Keychain). Tokens must never reach SQLite or AsyncStorage (plan §12, D-021).
 */

import * as SecureStore from 'expo-secure-store';

import type { OAuthTokens, TokenStore } from '@/providers/types';

const KEY_PREFIX = 'mailyo.tokens.';

function tokenKey(accountId: string): string {
  return `${KEY_PREFIX}${accountId}`;
}

export class SecureTokenStore implements TokenStore {
  async save(accountId: string, tokens: OAuthTokens): Promise<void> {
    await SecureStore.setItemAsync(tokenKey(accountId), JSON.stringify(tokens));
  }

  async load(accountId: string): Promise<OAuthTokens | null> {
    const raw = await SecureStore.getItemAsync(tokenKey(accountId));
    if (raw === null) {
      return null;
    }
    return JSON.parse(raw) as OAuthTokens;
  }

  async remove(accountId: string): Promise<void> {
    await SecureStore.deleteItemAsync(tokenKey(accountId));
  }
}
