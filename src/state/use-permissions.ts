/**
 * Permissions MailYo depends on, read live from the OS:
 * - notifications (vital: without it no mail can ring);
 * - no battery restriction (vital while « Notifications instantanées » is on:
 *   Android otherwise kills the permanent connection);
 * - periodic background sync (backup when the connection was cut).
 *
 * Re-read whenever the app comes back to the foreground, since the user grants
 * most of them in the system settings.
 */

import * as BackgroundTask from 'expo-background-task';
import * as Notifications from 'expo-notifications';
import { useCallback, useEffect, useState } from 'react';
import { AppState, Linking, Platform } from 'react-native';

import { realtimeTransports } from '@/realtime/use-realtime';
import { isBackgroundSyncRegistered, registerBackgroundSync } from '@/sync/background-sync';

export type PermissionId = 'notifications' | 'battery' | 'background';

export interface PermissionState {
  id: PermissionId;
  label: string;
  /** What it is for, shown under the label. */
  description: string;
  icon: string;
  /** null: not applicable on this device / build. */
  granted: boolean | null;
  /** Mail can be missed without it: drives the alert dot. */
  vital: boolean;
}

export async function readPermissions(realtimeOn: boolean): Promise<PermissionState[]> {
  const { idle } = realtimeTransports();

  let notifications: boolean | null = null;
  try {
    notifications = (await Notifications.getPermissionsAsync()).granted;
  } catch {
    notifications = null;
  }

  let battery: boolean | null = null;
  if (Platform.OS === 'android' && idle.isAvailable()) {
    try {
      battery = (await idle.status()).batteryUnrestricted;
    } catch {
      battery = null;
    }
  }

  let background: boolean | null = null;
  try {
    const status = await BackgroundTask.getStatusAsync();
    background =
      status === BackgroundTask.BackgroundTaskStatus.Available &&
      (await isBackgroundSyncRegistered());
  } catch {
    background = null;
  }

  return [
    {
      id: 'notifications',
      label: 'Notifications',
      description: 'Être prévenu à l’arrivée d’un mail',
      icon: 'notifications-active',
      granted: notifications,
      vital: true,
    },
    {
      id: 'battery',
      label: 'Batterie sans restriction',
      description: 'Empêche Android de couper la réception en arrière-plan',
      icon: 'battery-charging-full',
      granted: battery,
      vital: realtimeOn,
    },
    {
      id: 'background',
      label: 'Relève en arrière-plan',
      description: 'Vérifie la boîte régulièrement, même app fermée',
      icon: 'sync',
      granted: background,
      vital: false,
    },
  ];
}

/** Ask for (or open the settings page of) one permission. */
export async function requestPermission(id: PermissionId): Promise<void> {
  if (id === 'notifications') {
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) return;
    if (current.canAskAgain) {
      await Notifications.requestPermissionsAsync();
    } else {
      await Linking.openSettings();
    }
    return;
  }
  if (id === 'battery') {
    realtimeTransports().idle.openBatterySettings();
    return;
  }
  await registerBackgroundSync();
}

/** A vital permission is refused. */
export function hasMissingVital(states: PermissionState[]): boolean {
  return states.some((state) => state.vital && state.granted === false);
}

export function usePermissions(realtimeOn: boolean) {
  const [states, setStates] = useState<PermissionState[]>([]);

  const refresh = useCallback(async () => {
    setStates(await readPermissions(realtimeOn));
  }, [realtimeOn]);

  useEffect(() => {
    let alive = true;
    void readPermissions(realtimeOn).then((next) => {
      if (alive) setStates(next);
    });
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void readPermissions(realtimeOn).then((next) => {
          if (alive) setStates(next);
        });
      }
    });
    return () => {
      alive = false;
      subscription.remove();
    };
  }, [realtimeOn]);

  const request = useCallback(
    async (id: PermissionId) => {
      await requestPermission(id);
      // The battery page is a system screen: the AppState listener re-reads on return.
      await refresh();
    },
    [refresh],
  );

  return { states, missingVital: hasMissingVital(states), refresh, request };
}
