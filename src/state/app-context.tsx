/**
 * React binding for `MailService`.
 *
 * The service is created once (it opens the database and starts synchronising),
 * then exposed through context. Screens read through the service directly and
 * subscribe to `revision`, which is bumped after every mutation so lists reload
 * without a heavy state library.
 */

import * as SplashScreen from 'expo-splash-screen';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { getDatabase } from '@/data/db/instance';
import { createExpoNotificationApi, Notifier } from '@/notifications/notifier';
import { MailService } from '@/services/mail-service';
import { registerBackgroundSync } from '@/sync/background-sync';

export interface AppContextValue {
  service: MailService;
  ready: boolean;
  error: string | null;
  /** Bumped after every mutation so lists reload. */
  revision: number;
  /** Re-run a full sync, then refresh the screens. */
  refresh: () => Promise<void>;
  /** Refresh the screens without a network round-trip. */
  invalidate: () => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [service, setService] = useState<MailService | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const db = await getDatabase();
      const created = new MailService({
        db,
        notifier: new Notifier(createExpoNotificationApi()),
      });
      if (cancelled) {
        return;
      }
      setService(created);
      await created.ensureNotificationsConfigured();
      await created.initialize();
      await registerBackgroundSync();
    })()
      .catch((cause: unknown) => {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : String(cause));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setReady(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const refresh = useCallback(async () => {
    if (!service) {
      return;
    }
    await service.syncAll();
    setRevision((value) => value + 1);
  }, [service]);

  const invalidate = useCallback(() => {
    setRevision((value) => value + 1);
  }, []);

  const value = useMemo<AppContextValue | null>(() => {
    if (!service) {
      return null;
    }
    return { service, ready, error, revision, refresh, invalidate };
  }, [service, ready, error, revision, refresh, invalidate]);

  // Hide the splash as soon as the app is usable — or once initialisation has
  // failed, so the user is never stuck on a frozen splash screen.
  useEffect(() => {
    if (ready || error !== null) {
      SplashScreen.hideAsync();
    }
  }, [ready, error]);

  if (!value) {
    return null;
  }

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

/** Consume the app context. Throws outside of `<AppProvider>`. */
export function useApp(): AppContextValue {
  const value = useContext(AppContext);
  if (!value) {
    throw new Error('useApp must be used inside <AppProvider>');
  }
  return value;
}
