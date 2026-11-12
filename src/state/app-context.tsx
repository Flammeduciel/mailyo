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
import { useRealtime } from '@/realtime/use-realtime';
import { createExpoBiometricAuthenticator } from '@/security';
import { createAppMailService } from '@/services/create-app-service';
import type { MailService } from '@/services/mail-service';
import { registerBackgroundSync } from '@/sync/background-sync';
import { ThemePreferenceProvider, type ThemePreference } from '@/ui';

const authenticator = createExpoBiometricAuthenticator();

export interface AppContextValue {
  service: MailService;
  ready: boolean;
  error: string | null;
  /** Bumped after every mutation so lists reload. */
  revision: number;
  /** Persisted colour-scheme preference. */
  theme: ThemePreference;
  /** Set the preference; persists it and updates the design system. */
  setTheme: (preference: ThemePreference) => Promise<void>;
  /** True while the biometric app lock is engaged. */
  locked: boolean;
  /** Whether the device can perform a biometric check at all. */
  biometricsAvailable: boolean;
  /** Prompt for biometrics; resolves true and lifts the lock on success. */
  unlock: () => Promise<boolean>;
  /** Re-run a full sync, then refresh the screens. */
  refresh: () => Promise<void>;
  /** Progress of the running sync (null when idle); lists refresh as mail arrives. */
  sync: SyncStatus | null;
  /** Refresh the screens without a network round-trip. */
  invalidate: () => void;
  /** Re-send the real-time configuration (after a settings change). */
  applyRealtime: () => Promise<void>;
}

/** Exported for tests and the screenshot harness (fake services). */
export const AppContext = createContext<AppContextValue | null>(null);

export interface SyncStatus {
  /** 0..1 */
  ratio: number;
  /** Messages stored so far in this run. */
  stored: number;
}

/** How often lists reload while a sync is storing new mail. */
const LIVE_REFRESH_MS = 700;

export function AppProvider({ children }: { children: ReactNode }) {
  const [service, setService] = useState<MailService | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [theme, setThemePreference] = useState<ThemePreference>('system');
  const [locked, setLocked] = useState(false);
  const [biometricsAvailable, setBiometricsAvailable] = useState(false);
  const [sync, setSync] = useState<SyncStatus | null>(null);
  const runSync = useCallback((target: MailService): Promise<void> => {
    // MailService.syncAll joins a sync already running (polling, wake-ups, pull-to-refresh).
    let lastBump = 0;
    let lastStored = 0;
    setSync({ ratio: 0, stored: 0 });
    const run = target
      .syncAll((progress) => {
        setSync({ ratio: progress.ratio, stored: progress.stored });
        const now = Date.now();
        if (progress.stored > lastStored && now - lastBump > LIVE_REFRESH_MS) {
          lastBump = now;
          lastStored = progress.stored;
          setRevision((value) => value + 1);
        }
      })
      .finally(() => {
        setSync(null);
        setRevision((value) => value + 1);
      });
    return run;
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const db = await getDatabase();
      const created = createAppMailService(db);
      if (cancelled) {
        return;
      }
      // Preferences come from the local database only, so the persisted theme and
      // lock apply even when the network sync below is slow or fails.
      await created.loadState();
      const available = await authenticator.isAvailable();
      if (cancelled) {
        return;
      }
      setThemePreference(created.getSettings().theme);
      setBiometricsAvailable(available);
      setLocked(available && created.getSettings().biometricLock);
      setService(created);
      void created
        .refreshContactPhotos()
        .then((changed) => {
          if (changed && !cancelled) {
            setRevision((value) => value + 1);
          }
        })
        .catch(() => undefined);
      await created.ensureNotificationsConfigured();
      await runSync(created);
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
  }, [runSync]);

  const { applyRealtime } = useRealtime(service, runSync, revision);

  const refresh = useCallback(async () => {
    if (!service) {
      return;
    }
    await runSync(service);
  }, [service, runSync]);

  const invalidate = useCallback(() => {
    setRevision((value) => value + 1);
  }, []);

  const setTheme = useCallback(
    async (preference: ThemePreference) => {
      if (!service) {
        return;
      }
      await service.updateSettings({ theme: preference });
      setThemePreference(preference);
    },
    [service],
  );

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
      theme,
      setTheme,
      locked,
      biometricsAvailable,
      unlock,
      refresh,
      sync,
      invalidate,
      applyRealtime,
    };
  }, [
    applyRealtime,
    sync,
    service,
    ready,
    error,
    revision,
    theme,
    setTheme,
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

  return (
    <ThemePreferenceProvider value={theme}>
      <AppContext.Provider value={value}>{children}</AppContext.Provider>
    </ThemePreferenceProvider>
  );
}

/** Consume the app context. Throws outside of `<AppProvider>`. */
export function useApp(): AppContextValue {
  const value = useContext(AppContext);
  if (!value) {
    throw new Error('useApp must be used inside <AppProvider>');
  }
  return value;
}
