/**
 * `idle` transport: drives the native IMAP IDLE service of `mailyo-imap`.
 */

import { Platform } from 'react-native';

import { getMailyoImap, type PushConfig } from '../../modules/mailyo-imap';
import type { RealtimeStatus, RealtimeTransport } from '@/realtime/transport';

export class ImapIdleTransport implements RealtimeTransport {
  readonly mode = 'idle' as const;

  isAvailable(): boolean {
    return Platform.OS === 'android';
  }

  async start(config: PushConfig): Promise<void> {
    getMailyoImap().startPush(JSON.stringify(config));
  }

  async stop(): Promise<void> {
    getMailyoImap().stopPush();
  }

  setAppForeground(foreground: boolean): void {
    if (!this.isAvailable()) return;
    try {
      getMailyoImap().setAppForeground(foreground);
    } catch {
      // Native module missing (old build): nothing to tell.
    }
  }

  onNewMail(listener: (accountId: string) => void): () => void {
    if (!this.isAvailable()) return () => {};
    try {
      const subscription = getMailyoImap().addListener('onNewMail', (event) =>
        listener(event.accountId),
      );
      return () => subscription.remove();
    } catch {
      return () => {};
    }
  }

  async status(): Promise<RealtimeStatus> {
    if (!this.isAvailable()) return { running: false, accounts: [], batteryUnrestricted: false };
    return getMailyoImap().pushStatus();
  }

  openBatterySettings(): void {
    getMailyoImap().openBatterySettings();
  }
}
