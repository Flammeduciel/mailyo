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
  /** Images up to this size (Mo) are fetched automatically for thumbnails; 0 disables it. */
  autoPreviewMaxMb: number;
  /** Ask before downloading attachments larger than this (Mo) on mobile data. */
  cellularConfirmMb: number;
  /** Remote images in HTML mails stay hidden until "Afficher les images" (tracking pixels). */
  blockRemoteImages: boolean;
  /** Keep attachments of starred mails available offline. */
  offlineStarredAttachments: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = {
  biometricLock: false,
  contentMode: 'full',
  defaultSoundId: 'default',
  quietHours: null,
  theme: 'system',
  autoPreviewMaxMb: 3,
  cellularConfirmMb: 10,
  blockRemoteImages: true,
  offlineStarredAttachments: false,
};

const SETTING_KEYS = {
  biometricLock: 'security.biometricLock',
  contentMode: 'notification.contentMode',
  defaultSoundId: 'notification.defaultSoundId',
  quietHours: 'notification.quietHours',
  theme: 'app.theme',
  autoPreviewMaxMb: 'attachments.autoPreviewMaxMb',
  cellularConfirmMb: 'attachments.cellularConfirmMb',
  blockRemoteImages: 'privacy.blockRemoteImages',
  offlineStarredAttachments: 'attachments.offlineStarred',
} as const;

function parseNumber(raw: string | undefined, fallback: number): number {
  const value = raw === undefined ? NaN : Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function parseBoolean(raw: string | undefined, fallback: boolean): boolean {
  return raw === 'true' ? true : raw === 'false' ? false : fallback;
}

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
      return {
        startHour: (parsed as QuietHours).startHour,
        endHour: (parsed as QuietHours).endHour,
      };
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
    defaultSoundId:
      sound === undefined ? DEFAULT_SETTINGS.defaultSoundId : sound === '' ? null : sound,
    quietHours: quiet === undefined ? DEFAULT_SETTINGS.quietHours : parseQuietHours(quiet),
    theme:
      theme === 'light' || theme === 'dark' || theme === 'system' ? theme : DEFAULT_SETTINGS.theme,
    autoPreviewMaxMb: parseNumber(
      raw[SETTING_KEYS.autoPreviewMaxMb],
      DEFAULT_SETTINGS.autoPreviewMaxMb,
    ),
    cellularConfirmMb: parseNumber(
      raw[SETTING_KEYS.cellularConfirmMb],
      DEFAULT_SETTINGS.cellularConfirmMb,
    ),
    blockRemoteImages: parseBoolean(
      raw[SETTING_KEYS.blockRemoteImages],
      DEFAULT_SETTINGS.blockRemoteImages,
    ),
    offlineStarredAttachments: parseBoolean(
      raw[SETTING_KEYS.offlineStarredAttachments],
      DEFAULT_SETTINGS.offlineStarredAttachments,
    ),
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
    [SETTING_KEYS.autoPreviewMaxMb]: String(settings.autoPreviewMaxMb),
    [SETTING_KEYS.cellularConfirmMb]: String(settings.cellularConfirmMb),
    [SETTING_KEYS.blockRemoteImages]: settings.blockRemoteImages ? 'true' : 'false',
    [SETTING_KEYS.offlineStarredAttachments]: settings.offlineStarredAttachments ? 'true' : 'false',
  };
}
