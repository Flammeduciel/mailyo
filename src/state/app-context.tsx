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
import { createExpoBiometricAuthenticator } from '@/security';
import { MailService } from '@/services/mail-service';
import { registerBackgroundSync } from '@/sync/background-sync';

const authenticator = createExpoBiometricAuthenticator();

export interface AppContextValue {
  service: MailService;
  ready: boolean;
  error: string | null;
  /** Bumped after every mutation so lists reload. */
  revision: number;
  /** True while the biometric app lock is engaged. */
  locked: boolean;
  /** Whether the device can perform a biometric check at all. */
  biometricsAvailable: boolean;
  /** Prompt for biometrics; resolves true and lifts the lock on success. */
  unlock: () => Promise<boolean>;
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
  const [locked, setLocked] = useState(false);
  const [biometricsAvailable, setBiometricsAvailable] = useState(false);

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
      const available = await authenticator.isAvailable();
      if (cancelled) {
        return;
      }
      setBiometricsAvailable(available);
      setLocked(available && created.getSettings().biometricLock);
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

  const unlock = useCallback(async (): Promise<boolean> => {
    const success = await authenticator.authenticate('Déverrouillez MailYo');
    if (success) {
      setLocked(false);
    }
    return success;
  }, []);

  const value = useMemo<AppContextValue | null>(() => {
    if (!service) {
      return null;
    }
    return {
      service,
      ready,
      error,
      revision,
      locked,
      biometricsAvailable,
      unlock,
      refresh,
      invalidate,
    };
  }, [
    service,
    ready,
    error,
    revision,
    locked,
    biometricsAvailable,
    unlock,
    refresh,
    invalidate,
  ]);

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
