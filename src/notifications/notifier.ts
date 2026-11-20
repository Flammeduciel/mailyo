/**
 * System notification publishing.
 *
 * `Notifier` owns the presentation logic but never imports the native module:
 * it talks to an injected {@link NotificationApi}. `createExpoNotificationApi`
 * is the single adapter that wraps `expo-notifications`, which keeps the
 * decision path pure and unit-testable.
 */

import * as Notifications from 'expo-notifications';

import { CHANNELS, getSound, type NotificationChannelSpec } from '@/notifications/channels';
import type { NotificationDecision } from '@/notifications/resolve';

export interface NotificationApi {
  setNotificationHandler(handler: {
    handleNotification: () => Promise<{
      shouldShowBanner: boolean;
      shouldShowList: boolean;
      shouldPlaySound: boolean;
      shouldSetBadge: boolean;
    }>;
  }): void;
  getPermissionsAsync(): Promise<{ granted: boolean; canAskAgain: boolean }>;
  requestPermissionsAsync(): Promise<{ granted: boolean }>;
  setNotificationChannelAsync(
    id: string,
    channel: {
      name: string;
      importance: number;
      vibrationPattern?: number[];
      sound?: string | null;
    },
  ): Promise<void>;
  scheduleNotificationAsync(request: {
    content: {
      title: string;
      body: string;
      sound?: string | null;
      data?: Record<string, unknown>;
    };
    trigger: null;
  }): Promise<string>;
  /** Notifications of the app still shown in the system tray. */
  getPresentedNotificationsAsync(): Promise<
    { identifier: string; data: Record<string, unknown> | null }[]
  >;
  dismissNotificationAsync(identifier: string): Promise<void>;
}

/** Removes a notification posted by the native IMAP service (mail `uid` of an account). */
export type NativeMailDismisser = (accountId: string, remoteUid: number) => void;

/** Mirrors expo-notifications' `AndroidImportance` values for our channels. */
const IMPORTANCE: Record<NotificationChannelSpec['importance'], number> = {
  min: 3,
  low: 4,
  default: 5,
  high: 6,
  max: 7,
};

const VIBRATION_PATTERN = [0, 250, 250, 250];

/** Content sound name: custom filename, `'default'`, or null for silence. */
function soundNameFor(soundId: string | null): string | null {
  const sound = getSound(soundId);
  if (sound.id === 'none') {
    return null;
  }
  return sound.file ?? 'default';
}

export class Notifier {
  constructor(
    private readonly api: NotificationApi,
    private readonly dismissNativeMail: NativeMailDismisser | null = null,
  ) {}

  /** Install the foreground handler and (re)create the three channels. */
  async configure(): Promise<void> {
    this.api.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });

    for (const channel of CHANNELS) {
      await this.api.setNotificationChannelAsync(channel.id, {
        name: channel.name,
        importance: IMPORTANCE[channel.importance],
        vibrationPattern: channel.vibration ? VIBRATION_PATTERN : undefined,
        sound: getSound(channel.soundId).file,
      });
    }
  }

  /** Ensure notification permission, asking only when the OS allows it. */
  async requestPermission(): Promise<boolean> {
    const current = await this.api.getPermissionsAsync();
    if (current.granted) {
      return true;
    }
    if (!current.canAskAgain) {
      return false;
    }
    const requested = await this.api.requestPermissionsAsync();
    return requested.granted;
  }

  /** Present a resolved decision immediately. No-op when it should not notify. */
  async present(decision: NotificationDecision, url?: string, threadId?: string): Promise<void> {
    if (!decision.notify) {
      return;
    }
    await this.api.scheduleNotificationAsync({
      content: {
        title: decision.title,
        body: decision.body,
        sound: soundNameFor(decision.soundId),
        // Where a tap leads (see app/_layout.tsx and app/open-mail.tsx).
        ...(url || threadId
          ? { data: { ...(url ? { url } : {}), ...(threadId ? { threadId } : {}) } }
          : {}),
      },
      trigger: null,
    });
  }

  /**
   * The conversation was read: its notifications leave the tray, like in a chat
   * app. Covers the app's own notifications (tagged with the thread) and the
   * ones of the native IMAP service (one per mail uid).
   */
  async dismissThread(
    threadId: string,
    messages: readonly { accountId: string; remoteUid: number | null }[],
  ): Promise<void> {
    try {
      const presented = await this.api.getPresentedNotificationsAsync();
      for (const notification of presented) {
        if (notification.data?.threadId === threadId) {
          await this.api.dismissNotificationAsync(notification.identifier);
        }
      }
    } catch {
      // Best effort: a notification left behind is harmless.
    }
    if (!this.dismissNativeMail) return;
    for (const message of messages) {
      if (message.remoteUid === null) continue;
      try {
        this.dismissNativeMail(message.accountId, message.remoteUid);
      } catch {
        // Native module missing (old build).
      }
    }
  }

  /** Present a test notification using the given sound. */
  async presentTest(soundId: string | null): Promise<void> {
    await this.api.scheduleNotificationAsync({
      content: {
        title: 'Notification de test',
        body: 'Le son et la vibration sélectionnés seront utilisés.',
        sound: soundNameFor(soundId),
      },
      trigger: null,
    });
  }
}

/** The only place that imports `expo-notifications`. */
export function createExpoNotificationApi(): NotificationApi {
  return {
    setNotificationHandler: (handler) => {
      Notifications.setNotificationHandler({
        handleNotification: async () => handler.handleNotification(),
      });
    },
    getPermissionsAsync: async () => {
      const status = await Notifications.getPermissionsAsync();
      return { granted: status.granted, canAskAgain: status.canAskAgain };
    },
    requestPermissionsAsync: async () => {
      const status = await Notifications.requestPermissionsAsync();
      return { granted: status.granted };
    },
    setNotificationChannelAsync: async (id, channel) => {
      await Notifications.setNotificationChannelAsync(id, {
        name: channel.name,
        importance: channel.importance as Notifications.AndroidImportance,
        vibrationPattern: channel.vibrationPattern,
        sound: channel.sound,
      });
    },
    scheduleNotificationAsync: async (request) =>
      Notifications.scheduleNotificationAsync({
        content: {
          title: request.content.title,
          body: request.content.body,
          sound: request.content.sound ?? false,
          ...(request.content.data ? { data: request.content.data } : {}),
        },
        trigger: request.trigger,
      }),
    getPresentedNotificationsAsync: async () => {
      const presented = await Notifications.getPresentedNotificationsAsync();
      return presented.map((notification) => ({
        identifier: notification.request.identifier,
        data: (notification.request.content.data as Record<string, unknown> | null) ?? null,
      }));
    },
    dismissNotificationAsync: (identifier) => Notifications.dismissNotificationAsync(identifier),
  };
}
