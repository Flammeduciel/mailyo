/**
 * Notification channels and built-in sounds.
 *
 * Android 8+ groups notifications into channels; each channel owns an
 * importance, a vibration behaviour and a sound. The rule engine decides
 * *whether* to notify and *which* sound/vibration to use; this module maps that
 * decision onto one of the three channels the app creates. Pure data and pure
 * functions only, the native API is touched exclusively in `notifier.ts`.
 */

import type { VibrationMode } from '@/domain/models';

export interface NotificationChannelSpec {
  id: string;
  name: string;
  description: string;
  importance: 'min' | 'low' | 'default' | 'high' | 'max';
  vibration: boolean;
  soundId: string | null;
}

export const DEFAULT_CHANNEL_ID = 'default';
export const PRIORITY_CHANNEL_ID = 'priority';
export const SILENT_CHANNEL_ID = 'silent';

export interface BuiltInSound {
  id: string;
  name: string;
  /** Bundled asset filename, or null for the system default / silence. */
  file: string | null;
}

const DEFAULT_SOUND: BuiltInSound = { id: 'default', name: 'Par défaut', file: null };

export const BUILT_IN_SOUNDS: BuiltInSound[] = [
  DEFAULT_SOUND,
  { id: 'soft', name: 'Doux', file: 'soft.wav' },
  { id: 'chime', name: 'Carillon', file: 'chime.wav' },
  { id: 'urgent', name: 'Urgent', file: 'urgent.wav' },
  { id: 'none', name: 'Aucun', file: null },
];

export const CHANNELS: NotificationChannelSpec[] = [
  {
    id: DEFAULT_CHANNEL_ID,
    name: 'Par défaut',
    description: 'Notifications des messages suivis.',
    importance: 'high',
    vibration: true,
    soundId: DEFAULT_SOUND.id,
  },
  {
    id: PRIORITY_CHANNEL_ID,
    name: 'Prioritaire',
    description: 'Messages importants et contacts VIP.',
    importance: 'max',
    vibration: true,
    soundId: 'urgent',
  },
  {
    id: SILENT_CHANNEL_ID,
    name: 'Silencieux',
    description: 'Messages sans alerte sonore ni vibration.',
    importance: 'low',
    vibration: false,
    soundId: 'none',
  },
];

/** Resolve a sound id to its definition, falling back to the default sound. */
export function getSound(id: string | null): BuiltInSound {
  if (id === null) {
    return DEFAULT_SOUND;
  }
  return BUILT_IN_SOUNDS.find((sound) => sound.id === id) ?? DEFAULT_SOUND;
}

/**
 * Pick the channel a resolved decision should be presented on:
 * silent when nothing should alert, priority for urgent sounds or long
 * vibrations, and the default channel otherwise.
 */
export function channelIdForDecision(input: {
  notify: boolean;
  soundId: string | null;
  vibrationMode: VibrationMode;
}): string {
  if (!input.notify) {
    return SILENT_CHANNEL_ID;
  }
  if (input.soundId === 'none' && input.vibrationMode === 'none') {
    return SILENT_CHANNEL_ID;
  }
  if (input.soundId === 'urgent' || input.vibrationMode === 'long') {
    return PRIORITY_CHANNEL_ID;
  }
  return DEFAULT_CHANNEL_ID;
}
