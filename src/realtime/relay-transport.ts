/**
 * `relay` transport — reserved, not implemented yet (see docs/realtime-relay.md).
 *
 * Planned flow: the app registers its FCM token and account ids with the relay;
 * the relay subscribes to provider push (Gmail `users.watch` → Pub/Sub,
 * Microsoft Graph change notifications) and sends a data-only FCM message
 * « new mail for account X » (no content). The app then syncs as with `idle`.
 */

import type { PushConfig } from '../../modules/mailyo-imap';
import type { RealtimeStatus, RealtimeTransport } from '@/realtime/transport';

export class RelayTransport implements RealtimeTransport {
  readonly mode = 'relay' as const;

  isAvailable(): boolean {
    return false;
  }

  async start(_config: PushConfig): Promise<void> {
    throw new Error('Le serveur relais n’est pas encore disponible.');
  }

  async stop(): Promise<void> {}

  setAppForeground(): void {}

  onNewMail(): () => void {
    return () => {};
  }

  async status(): Promise<RealtimeStatus> {
    return { running: false, accounts: [], batteryUnrestricted: false };
  }

  openBatterySettings(): void {}
}
