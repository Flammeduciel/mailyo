/**
 * Real-time delivery of new mail. Two transports share one contract:
 *
 * - `idle` (available): IMAP IDLE in an Android foreground service, no server;
 *   Gmail is watched over IMAP with the user's Google sign-in (XOAUTH2).
 * - `relay` (planned): provider push (Gmail Pub/Sub, Microsoft Graph
 *   subscriptions) forwarded by a small relay server as an FCM message. See
 *   docs/realtime-relay.md; the setting is shown as « Bientôt disponible ».
 */

import type { PushConfig } from '../../modules/mailyo-imap';
import type { RealtimeMode } from '@/domain/settings';

export type { RealtimeMode };

export interface RealtimeStatus {
  running: boolean;
  /** Addresses being watched. */
  accounts: string[];
  /** Wouah Mail is exempt from battery optimisation (fewer delays). */
  batteryUnrestricted: boolean;
}

export interface RealtimeTransport {
  readonly mode: Exclude<RealtimeMode, 'off'>;
  /** Usable on this device / build. */
  isAvailable(): boolean;
  start(config: PushConfig): Promise<void>;
  stop(): Promise<void>;
  /** On screen, the app syncs and notifies itself; in the background, the transport does. */
  setAppForeground(foreground: boolean): void;
  /** Called when new mail is announced (to sync right away). Returns an unsubscribe. */
  onNewMail(listener: (accountId: string) => void): () => void;
  status(): Promise<RealtimeStatus>;
  openBatterySettings(): void;
}
