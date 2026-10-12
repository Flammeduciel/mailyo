/**
 * Gmail OAuth 2.0 adapter.
 *
 * This is the Phase 0 integration point: the authorization-code + PKCE flow is
 * wired through `expo-auth-session` (which itself opens the system browser via
 * `expo-web-browser`). It is deliberately not unit tested here because it needs
 * a real browser and Google credentials; only the types are exercised.
 *
 * TODO(Phase 0): implement the refresh_token grant and the revocation call once
 * the Gmail client id and OAuth consent screen are available on device.
 */

import { AuthRequest, ResponseType, exchangeCodeAsync, makeRedirectUri } from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';

import type { OAuthAdapter, OAuthTokens } from '@/providers/types';

const USERINFO_ENDPOINT = 'https://openidconnect.googleapis.com/v1/userinfo';

/**
 * Resolve the authenticated address from Google's userinfo endpoint. Uses the
 * `userinfo.email` scope; the access token must still be valid.
 */
export async function fetchGmailAddress(accessToken: string): Promise<string> {
  const response = await fetch(USERINFO_ENDPOINT, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    throw new Error(`Impossible de lire l’adresse Gmail (HTTP ${response.status})`);
  }
  const data = (await response.json()) as { email?: string };
  if (!data.email) {
    throw new Error('Réponse Gmail sans adresse email');
  }
  return data.email;
}

export interface GmailOAuthConfig {
  clientId: string;
  redirectUri: string;
  scopes: string[];
}

/** App scheme declared in `app.json` (`expo.scheme`). */
const APP_SCHEME = 'mailyo';

/** Minimum discovery document needed for code exchange (Google endpoints). */
const GOOGLE_DISCOVERY = {
  authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenEndpoint: 'https://oauth2.googleapis.com/token',
};

export function createGmailOAuthAdapter(config: GmailOAuthConfig): OAuthAdapter {
  return {
    async authorize(): Promise<OAuthTokens> {
      // Required on web so the redirect popup can complete the session.
      WebBrowser.maybeCompleteAuthSession();

      const redirectUri =
        config.redirectUri.trim() || makeRedirectUri({ scheme: APP_SCHEME, path: 'oauthredirect' });

      const request = new AuthRequest({
        clientId: config.clientId,
        redirectUri,
        scopes: config.scopes,
        responseType: ResponseType.Code,
        usePKCE: true,
        // `offline` + `consent` are required to receive a refresh token.
        extraParams: { access_type: 'offline', prompt: 'consent' },
      });

      const result = await request.promptAsync(GOOGLE_DISCOVERY);
      if (result.type === 'error') {
        throw new Error(
          `Autorisation Gmail refusée : ${result.error?.message ?? 'erreur inconnue'}`,
        );
      }
      if (result.type !== 'success') {
        throw new Error(`Autorisation Gmail interrompue (${result.type})`);
      }

      const code = result.params.code;
      if (!code) {
        throw new Error('Autorisation Gmail réussie sans code d’autorisation');
      }

      const token = await exchangeCodeAsync(
        {
          clientId: config.clientId,
          code,
          redirectUri,
          extraParams: { code_verifier: request.codeVerifier ?? '' },
        },
        GOOGLE_DISCOVERY,
      );

      return {
        accessToken: token.accessToken,
        refreshToken: token.refreshToken ?? null,
        expiresAt: token.expiresIn ? (token.issuedAt + token.expiresIn) * 1000 : null,
        scope: token.scope ?? config.scopes.join(' '),
        tokenType: token.tokenType,
      };
    },

    async refresh(_tokens: OAuthTokens): Promise<OAuthTokens> {
      // TODO(Phase 0): exchange the refresh token for a new access token.
      throw new Error('not implemented in mock build');
    },

    async revoke(_tokens: OAuthTokens): Promise<void> {
      // TODO(Phase 0): call the Google revocation endpoint.
      throw new Error('not implemented in mock build');
    },
  };
}
