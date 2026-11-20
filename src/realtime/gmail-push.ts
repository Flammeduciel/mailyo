/**
 * Instant Gmail without IMAP: Gmail push notifications.
 *
 * 1. The app asks Gmail to publish changes of the inbox to the project's
 *    Cloud Pub/Sub topic (`users.watch`, valid 7 days, renewed daily).
 * 2. Pub/Sub pushes « new mail for <address> » to the Wouah Mail relay.
 * 3. The relay sends a data-only FCM message to the phones registered for
 *    that address; the app wakes up, syncs through the Gmail API and shows
 *    the notification itself.
 *
 * The relay only knows addresses and FCM tokens, never mail content. Phones
 * prove they own an address with their own Google access token.
 */

export interface GmailPushConfig {
  /** Base URL of the relay, e.g. https://wouah-relay.flamme.work */
  relayUrl: string;
  /** Pub/Sub topic Gmail publishes to: projects/<project>/topics/<topic> */
  topicName: string;
}

/** Re-run `users.watch` this often (Gmail expires it after 7 days). */
export const GMAIL_WATCH_RENEW_MS = 24 * 60 * 60 * 1000;

export function isGmailPushConfigured(
  config: Partial<GmailPushConfig> | null | undefined,
): boolean {
  return Boolean(config?.relayUrl && config?.topicName);
}

export interface GmailPushAccount {
  email: string;
  accessToken: string;
}

export async function watchGmailInbox(
  account: GmailPushAccount,
  config: GmailPushConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const response = await fetchImpl('https://gmail.googleapis.com/gmail/v1/users/me/watch', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${account.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      topicName: config.topicName,
      labelIds: ['INBOX'],
      labelFilterBehavior: 'include',
    }),
  });
  if (!response.ok) {
    throw new Error(`Gmail watch failed (${response.status})`);
  }
}

export async function stopGmailWatch(
  accessToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  await fetchImpl('https://gmail.googleapis.com/gmail/v1/users/me/stop', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

async function callRelay(
  path: '/register' | '/unregister',
  account: GmailPushAccount,
  fcmToken: string,
  config: GmailPushConfig,
  fetchImpl: typeof fetch,
): Promise<void> {
  const response = await fetchImpl(`${config.relayUrl.replace(/\/+$/, '')}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: account.email,
      fcmToken,
      accessToken: account.accessToken,
    }),
  });
  if (!response.ok) {
    throw new Error(`Relay ${path} failed (${response.status})`);
  }
}

/** Watch the inbox and register this phone with the relay for the address. */
export async function enableGmailPush(
  account: GmailPushAccount,
  fcmToken: string,
  config: GmailPushConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  await watchGmailInbox(account, config, fetchImpl);
  await callRelay('/register', account, fcmToken, config, fetchImpl);
}

/** Best effort: this phone stops receiving pushes for the address. */
export async function disableGmailPush(
  account: GmailPushAccount,
  fcmToken: string,
  config: GmailPushConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  await callRelay('/unregister', account, fcmToken, config, fetchImpl).catch(() => undefined);
  await stopGmailWatch(account.accessToken, fetchImpl).catch(() => undefined);
}

/** The relay's data message: { type: 'gmail', email }. */
export function parseRelayMessage(data: unknown): { email: string } | null {
  if (!data || typeof data !== 'object') return null;
  const record = data as Record<string, unknown>;
  let payload: Record<string, unknown> = record;
  if (typeof record.dataString === 'string') {
    try {
      payload = JSON.parse(record.dataString) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
  if (payload.type !== 'gmail' || typeof payload.email !== 'string') return null;
  return { email: payload.email.toLowerCase() };
}
