/**
 * Builds the configuration handed to the native real-time service: which
 * mailboxes to watch, how to sign in, and the notification preferences it must
 * apply on its own (the app may be closed when a mail arrives).
 */

import type { PushAccountConfig, PushConfig } from '../../modules/mailyo-imap';
import type { Account } from '@/domain/models';
import type { AppSettings } from '@/domain/settings';
import type { ImapAccountConfig } from '@/providers/imap/credentials';
import type { OAuthTokens } from '@/providers/types';

/** Accounts the real-time service can watch: password IMAP and Gmail (IMAP + Google sign-in). */
export function isRealtimeCapable(account: Account): boolean {
  return (
    account.provider === 'imap' || (account.provider === 'gmail' && account.authType === 'oauth')
  );
}

export interface BuildPushConfigInput {
  accounts: Account[];
  settings: AppSettings;
  loadImapConfig: (accountId: string) => Promise<ImapAccountConfig | null>;
  loadTokens: (accountId: string) => Promise<OAuthTokens | null>;
  gmailClientId: string;
}

export async function buildPushConfig(input: BuildPushConfigInput): Promise<PushConfig> {
  const watched: PushAccountConfig[] = [];
  if (input.settings.realtimeMode === 'idle') {
    for (const account of input.accounts) {
      if (!account.syncEnabled || !isRealtimeCapable(account)) continue;
      const entry = await accountEntry(account, input);
      if (entry) watched.push(entry);
    }
  }
  return {
    accounts: watched,
    contentMode: input.settings.contentMode,
    quietStart: input.settings.quietHours?.startHour ?? -1,
    quietEnd: input.settings.quietHours?.endHour ?? -1,
  };
}

async function accountEntry(
  account: Account,
  input: BuildPushConfigInput,
): Promise<PushAccountConfig | null> {
  if (account.provider === 'imap') {
    const config = await input.loadImapConfig(account.id);
    if (!config) return null;
    return {
      id: account.id,
      email: account.emailAddress,
      host: config.imap.host,
      port: config.imap.port,
      security: config.imap.security,
      username: config.username,
      password: config.password,
    };
  }
  const tokens = await input.loadTokens(account.id);
  // Without a refresh token the service could only work for an hour.
  if (!tokens?.refreshToken || !input.gmailClientId) return null;
  return {
    id: account.id,
    email: account.emailAddress,
    host: 'imap.gmail.com',
    port: 993,
    security: 'ssl',
    username: account.emailAddress,
    oauthAccessToken: tokens.accessToken,
    oauthRefreshToken: tokens.refreshToken,
    oauthClientId: input.gmailClientId,
    oauthExpiresAt: tokens.expiresAt ?? 0,
  };
}
