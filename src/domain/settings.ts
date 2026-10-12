/**
 * Application preferences: notification content, default sound, quiet hours and
 * theme. Pure parsing/serialisation so they can be tested without a database.
 */

import type { NotificationContentMode, QuietHours } from '@/domain/models';

export interface AppSettings {
  /** Require Face ID / fingerprint before showing the app. */
  biometricLock: boolean;
  /** 'full' shows sender + subject + preview, 'sender' hides the preview, 'hidden' hides everything. */
  contentMode: NotificationContentMode;
  /** Built-in sound id, or null for the system default. */
  defaultSoundId: string | null;
  /** Quiet hours during which notifications are silenced unless a VIP rule matches. */
  quietHours: QuietHours | null;
  /** Preferred colour scheme; 'system' follows the device. */
  theme: 'system' | 'light' | 'dark';
}

export const DEFAULT_SETTINGS: AppSettings = {
  biometricLock: false,
  contentMode: 'full',
  defaultSoundId: 'default',
  quietHours: null,
  theme: 'system',
};

const SETTING_KEYS = {
  biometricLock: 'security.biometricLock',
  contentMode: 'notification.contentMode',
  defaultSoundId: 'notification.defaultSoundId',
  quietHours: 'notification.quietHours',
  theme: 'app.theme',
} as const;

const CONTENT_MODES: readonly NotificationContentMode[] = ['full', 'sender', 'hidden'];

function parseQuietHours(raw: string): QuietHours | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      parsed !== null &&
      typeof parsed === 'object' &&
      typeof (parsed as QuietHours).startHour === 'number' &&
      typeof (parsed as QuietHours).endHour === 'number'
    ) {
      return { startHour: (parsed as QuietHours).startHour, endHour: (parsed as QuietHours).endHour };
    }
  } catch {
    // fall through to null
  }
  return null;
}

/** Build typed settings from the raw key/value rows, falling back to defaults. */
export function parseAppSettings(raw: Record<string, string>): AppSettings {
  const biometricLock = raw[SETTING_KEYS.biometricLock];
  const contentMode = raw[SETTING_KEYS.contentMode];
  const sound = raw[SETTING_KEYS.defaultSoundId];
  const quiet = raw[SETTING_KEYS.quietHours];
  const theme = raw[SETTING_KEYS.theme];

  return {
    biometricLock:
      biometricLock === 'true'
        ? true
        : biometricLock === 'false'
          ? false
          : DEFAULT_SETTINGS.biometricLock,
    contentMode:
      contentMode !== undefined && (CONTENT_MODES as readonly string[]).includes(contentMode)
        ? (contentMode as NotificationContentMode)
        : DEFAULT_SETTINGS.contentMode,
    defaultSoundId: sound === undefined ? DEFAULT_SETTINGS.defaultSoundId : sound === '' ? null : sound,
    quietHours: quiet === undefined ? DEFAULT_SETTINGS.quietHours : parseQuietHours(quiet),
    theme:
      theme === 'light' || theme === 'dark' || theme === 'system'
        ? theme
        : DEFAULT_SETTINGS.theme,
  };
}

/** Flatten typed settings into the key/value rows the repository stores. */
export function serializeAppSettings(settings: AppSettings): Record<string, string> {
  return {
    [SETTING_KEYS.biometricLock]: settings.biometricLock ? 'true' : 'false',
    [SETTING_KEYS.contentMode]: settings.contentMode,
    [SETTING_KEYS.defaultSoundId]: settings.defaultSoundId ?? '',
    [SETTING_KEYS.quietHours]: settings.quietHours ? JSON.stringify(settings.quietHours) : '',
    [SETTING_KEYS.theme]: settings.theme,
  };
}
