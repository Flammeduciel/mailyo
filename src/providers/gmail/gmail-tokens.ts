/**
 * Access-token lifecycle for Gmail accounts.
 *
 * Google access tokens live about one hour. `createGmailTokenProvider` hands out
 * a valid one, refreshing it through the `refresh_token` grant when it is about
 * to expire (or when the API answered 401) and persisting the result in the
 * secure store. Native (Android/iOS) OAuth clients have no client secret, so
 * the grant only needs `client_id` + `refresh_token`.
 */

import type { OAuthTokens, TokenStore } from '@/providers/types';

const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';

/** Refresh this long before the announced expiry to absorb clock skew. */
const EXPIRY_MARGIN_MS = 60_000;

export class GmailAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GmailAuthError';
  }
}

export interface RefreshGmailTokensInput {
  clientId: string;
  tokens: OAuthTokens;
  now?: () => number;
  fetchImpl?: typeof fetch;
}

/** Exchange the refresh token for a new access token (refresh token is kept). */
export async function refreshGmailTokens(input: RefreshGmailTokensInput): Promise<OAuthTokens> {
  const { clientId, tokens } = input;
  const now = input.now ?? (() => Date.now());
  const fetchImpl = input.fetchImpl ?? fetch;

  if (!tokens.refreshToken) {
    throw new GmailAuthError('Session Gmail expirée : reconnectez le compte.');
  }

  const body = [
    `client_id=${encodeURIComponent(clientId)}`,
    `refresh_token=${encodeURIComponent(tokens.refreshToken)}`,
    'grant_type=refresh_token',
  ].join('&');

  const response = await fetchImpl(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const data = (await response.json().catch(() => ({}))) as {
    access_token?: string;
    expires_in?: number;
    scope?: string;
    token_type?: string;
    refresh_token?: string;
    error?: string;
  };

  if (!response.ok || !data.access_token) {
    // `invalid_grant`: revoked, or expired (7 days while the consent screen is in "Test").
    throw new GmailAuthError(
      data.error === 'invalid_grant'
        ? 'Autorisation Gmail expirée ou révoquée : reconnectez le compte.'
        : `Renouvellement du jeton Gmail impossible (${data.error ?? `HTTP ${response.status}`})`,
    );
  }

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? tokens.refreshToken,
    expiresAt: data.expires_in ? now() + data.expires_in * 1000 : null,
    scope: data.scope ?? tokens.scope,
    tokenType: data.token_type ?? tokens.tokenType,
  };
}

/** Returns a valid access token; `forceRefresh` skips the expiry check (after a 401). */
export type AccessTokenProvider = (forceRefresh?: boolean) => Promise<string>;

export interface GmailTokenProviderOptions {
  accountId: string;
  clientId: string;
  tokenStore: TokenStore;
  now?: () => number;
  fetchImpl?: typeof fetch;
}

export function createGmailTokenProvider(options: GmailTokenProviderOptions): AccessTokenProvider {
  const now = options.now ?? (() => Date.now());
  // Concurrent API calls share a single refresh round-trip.
  let inFlight: Promise<string> | null = null;

  return async (forceRefresh = false) => {
    const tokens = await options.tokenStore.load(options.accountId);
    if (!tokens) {
      throw new GmailAuthError('Aucun jeton Gmail pour ce compte : reconnectez-le.');
    }
    const fresh = tokens.expiresAt === null || tokens.expiresAt - EXPIRY_MARGIN_MS > now();
    if (fresh && !forceRefresh) {
      return tokens.accessToken;
    }
    if (!inFlight) {
      inFlight = (async () => {
        try {
          const next = await refreshGmailTokens({
            clientId: options.clientId,
            tokens,
            now,
            fetchImpl: options.fetchImpl,
          });
          await options.tokenStore.save(options.accountId, next);
          return next.accessToken;
        } finally {
          inFlight = null;
        }
      })();
    }
    return inFlight;
  };
}
