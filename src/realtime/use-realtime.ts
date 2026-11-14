/**
 * Keeps new mail flowing in while Wouah Mail is open, and hands over to the
 * real-time transport when it goes to the background:
 *
 * - on screen: sync on resume, then every 30 s; announced mail syncs at once;
 * - in the background: the transport (IMAP IDLE service) watches and notifies.
 *
 * The transport configuration is re-sent only when it actually changes
 * (accounts added or removed, notification preferences).
 */

import { useCallback, useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { ImapIdleTransport } from '@/realtime/idle-transport';
import { RelayTransport } from '@/realtime/relay-transport';
import type { RealtimeTransport } from '@/realtime/transport';
import type { MailService } from '@/services/mail-service';

/** Polling period while the app is on screen. */
export const FOREGROUND_POLL_MS = 30_000;
/** No resume sync if the last one is more recent than this. */
const RESUME_MIN_GAP_MS = 10_000;

const idle = new ImapIdleTransport();
const relay = new RelayTransport();

export function realtimeTransports(): { idle: RealtimeTransport; relay: RealtimeTransport } {
  return { idle, relay };
}

export function useRealtime(
  service: MailService | null,
  sync: (target: MailService) => Promise<void>,
  revision: number,
): { applyRealtime: () => Promise<void> } {
  const lastConfig = useRef<string | null>(null);
  const lastSyncAt = useRef(0);

  /** `sync` runs one sync at a time: a mail announced during a sync joins it. */
  const syncOnce = useCallback(
    (target: MailService): Promise<void> => {
      lastSyncAt.current = Date.now();
      return sync(target).catch(() => undefined);
    },
    [sync],
  );

  const applyRealtime = useCallback(async () => {
    if (!service || !idle.isAvailable()) return;
    try {
      const config = await service.getPushConfig();
      const json = JSON.stringify(config);
      if (json === lastConfig.current) return;
      lastConfig.current = json;
      if (config.accounts.length === 0) {
        await idle.stop();
      } else {
        await idle.start(config);
      }
    } catch (error) {
      // Older build without the service, or permission refused: polling remains.
      lastConfig.current = null;
      console.warn('[realtime] could not start the IMAP IDLE service', error);
    }
  }, [service]);

  // Accounts or settings may have changed: re-send the configuration (debounced).
  useEffect(() => {
    if (!service) return;
    const timer = setTimeout(() => void applyRealtime(), 1_500);
    return () => clearTimeout(timer);
  }, [service, revision, applyRealtime]);

  // Foreground: notify ourselves, poll every 30 s, sync on resume.
  useEffect(() => {
    if (!service) return;
    let timer: ReturnType<typeof setInterval> | null = null;
    const enter = (state: AppStateStatus) => {
      const active = state === 'active';
      service.setAppForeground(active);
      idle.setAppForeground(active);
      if (timer) clearInterval(timer);
      timer = null;
      if (!active) return;
      if (Date.now() - lastSyncAt.current > RESUME_MIN_GAP_MS) void syncOnce(service);
      timer = setInterval(() => void syncOnce(service), FOREGROUND_POLL_MS);
    };
    lastSyncAt.current = Date.now(); // start-up sync is already running
    enter(AppState.currentState);
    const subscription = AppState.addEventListener('change', enter);
    const unsubscribe = idle.onNewMail(() => void syncOnce(service));
    return () => {
      subscription.remove();
      unsubscribe();
      if (timer) clearInterval(timer);
    };
  }, [service, syncOnce]);

  return { applyRealtime };
}
