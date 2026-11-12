/**
 * MailYo design system — colours, spacing, radii and typography scale.
 *
 * Identity: "encre" — a deep indigo accent on cool slate neutrals. Calm,
 * editorial and readable for long mail bodies; the accent is reserved for
 * actions, selection and unread state so screens never look busy. Every value
 * here is MailYo's own (no palette borrowed from another messaging app).
 * Light/dark follow the device or the user's preference.
 */

import { useResolvedScheme } from './theme-preference';

export interface AppColors {
  background: string;
  surface: string;
  surfaceAlt: string;
  border: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  primary: string;
  onPrimary: string;
  /** Tinted container: active nav indicator, selected chip, selected rows. */
  primaryContainer: string;
  onPrimaryContainer: string;
  /** Brand title in the main app bar. */
  brand: string;
  danger: string;
  /** Soft background behind danger text (badges, destructive pills). */
  dangerContainer: string;
  success: string;
  warning: string;
  unreadBadge: string;
  /** Conversation screen background ("wallpaper"). */
  chatBackground: string;
  bubbleIncoming: string;
  bubbleOutgoing: string;
  bubbleIncomingText: string;
  bubbleOutgoingText: string;
  /** Quoted-reply block inside a bubble. */
  quoteBackground: string;
  link: string;
  /** Filter chips. */
  chip: string;
  chipText: string;
  /** Floating action button. */
  fab: string;
  onFab: string;
  /** Translucent overlay behind menus. */
  scrim: string;
  /** Page behind grouped cards (settings, forms). */
  groupedBackground: string;
  /** Card sitting on `groupedBackground`. */
  card: string;
  /** Hairline between rows inside a card. */
  separator: string;
  /** Snackbar / toast surface and its text. */
  inverseSurface: string;
  onInverseSurface: string;
  inversePrimary: string;
}

export const LightColors: AppColors = {
  background: '#FFFFFF',
  surface: '#FFFFFF',
  surfaceAlt: '#F1F2F6',
  border: '#E3E5EC',
  text: '#15171E',
  textSecondary: '#5B6072',
  textMuted: '#8B90A1',
  primary: '#3A4CD1',
  onPrimary: '#FFFFFF',
  primaryContainer: '#E7E9FB',
  onPrimaryContainer: '#1D2780',
  brand: '#15171E',
  danger: '#D2383F',
  dangerContainer: '#FCE9EA',
  success: '#1E8E5A',
  warning: '#B86E0A',
  unreadBadge: '#3A4CD1',
  chatBackground: '#F3F4F8',
  bubbleIncoming: '#FFFFFF',
  bubbleOutgoing: '#E4E7FB',
  bubbleIncomingText: '#15171E',
  bubbleOutgoingText: '#15171E',
  quoteBackground: 'rgba(29, 39, 128, 0.06)',
  link: '#3142C2',
  chip: '#F1F2F6',
  chipText: '#4A4F61',
  fab: '#3A4CD1',
  onFab: '#FFFFFF',
  scrim: 'rgba(12, 14, 22, 0.40)',
  groupedBackground: '#F3F4F8',
  card: '#FFFFFF',
  separator: '#ECEDF2',
  inverseSurface: '#23252E',
  onInverseSurface: '#F2F3F7',
  inversePrimary: '#A9B3FF',
};

export const DarkColors: AppColors = {
  background: '#101217',
  surface: '#171A21',
  surfaceAlt: '#1F232C',
  border: '#2A2E39',
  text: '#ECEEF3',
  textSecondary: '#A4A9B7',
  textMuted: '#757B8C',
  primary: '#97A3FF',
  onPrimary: '#121848',
  primaryContainer: '#272E5E',
  onPrimaryContainer: '#DEE2FF',
  brand: '#ECEEF3',
  danger: '#F27A7F',
  dangerContainer: '#3A1D21',
  success: '#55C690',
  warning: '#E6AA52',
  unreadBadge: '#97A3FF',
  chatBackground: '#101217',
  bubbleIncoming: '#1F232C',
  bubbleOutgoing: '#2B3370',
  bubbleIncomingText: '#ECEEF3',
  bubbleOutgoingText: '#ECEEF3',
  quoteBackground: 'rgba(0, 0, 0, 0.24)',
  link: '#AEB8FF',
  chip: '#1F232C',
  chipText: '#BAC0CC',
  fab: '#97A3FF',
  onFab: '#121848',
  scrim: 'rgba(0, 0, 0, 0.55)',
  groupedBackground: '#101217',
  card: '#181B22',
  separator: '#252932',
  inverseSurface: '#E6E8EF',
  onInverseSurface: '#1A1C23',
  inversePrimary: '#3A4CD1',
};

/**
 * Letter-avatar tints: soft background + strong foreground, picked from the
 * address so a person keeps the same colour everywhere.
 */
export const AvatarTints = {
  light: [
    { bg: '#E3E7FC', fg: '#2F3DA8' },
    { bg: '#DDF1EA', fg: '#17694A' },
    { bg: '#FBE8D7', fg: '#99510F' },
    { bg: '#F7E1E7', fg: '#A3304F' },
    { bg: '#EBE2F8', fg: '#5D3699' },
    { bg: '#DCEEF6', fg: '#1C6383' },
    { bg: '#EFEBDA', fg: '#6E5A12' },
    { bg: '#E6E8EC', fg: '#454B5A' },
  ],
  dark: [
    { bg: '#2B3266', fg: '#C9D0FF' },
    { bg: '#173D31', fg: '#9FE0C5' },
    { bg: '#45301C', fg: '#F5C799' },
    { bg: '#472331', fg: '#F4B3C5' },
    { bg: '#362752', fg: '#D5C1F5' },
    { bg: '#16394A', fg: '#A5D7EE' },
    { bg: '#3B351C', fg: '#E3D59A' },
    { bg: '#2C303A', fg: '#C6CAD4' },
  ],
} as const;

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const Radius = {
  sm: 8,
  md: 12,
  lg: 18,
  pill: 999,
} as const;

export const FontSize = {
  xs: 11,
  sm: 13,
  md: 15,
  lg: 18,
  xl: 22,
  xxl: 28,
} as const;

/** Resolve the active palette from the preference / OS scheme (defaults to light). */
export function useAppTheme(): AppColors {
  return useResolvedScheme() === 'dark' ? DarkColors : LightColors;
}
