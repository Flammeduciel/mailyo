/**
 * MailYo design system — colours, spacing, radii and typography scale.
 *
 * Layout and colour roles follow the familiar Android messaging conventions
 * (white app bar, tinted navigation indicator, chat wallpaper, tinted outgoing
 * bubbles, square-ish FAB) with MailYo's own blue accent. No external
 * dependency; light/dark follow the device or the user's preference.
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
}

export const LightColors: AppColors = {
  background: '#FFFFFF',
  surface: '#FFFFFF',
  surfaceAlt: '#F0F2F5',
  border: '#E4E6EA',
  text: '#111B21',
  textSecondary: '#54656F',
  textMuted: '#8696A0',
  primary: '#1A7AE0',
  onPrimary: '#FFFFFF',
  primaryContainer: '#D8EAFD',
  onPrimaryContainer: '#0B3D73',
  brand: '#1A7AE0',
  danger: '#DC2626',
  success: '#16A34A',
  warning: '#D97706',
  unreadBadge: '#1A7AE0',
  chatBackground: '#EDF2F7',
  bubbleIncoming: '#FFFFFF',
  bubbleOutgoing: '#D6E9FF',
  bubbleIncomingText: '#111B21',
  bubbleOutgoingText: '#111B21',
  quoteBackground: 'rgba(11, 61, 115, 0.07)',
  link: '#0B6BCB',
  chip: '#F0F2F5',
  chipText: '#54656F',
  fab: '#1A7AE0',
  onFab: '#FFFFFF',
  scrim: 'rgba(0, 0, 0, 0.32)',
};

export const DarkColors: AppColors = {
  background: '#0B141A',
  surface: '#111B21',
  surfaceAlt: '#202C33',
  border: '#222D34',
  text: '#E9EDEF',
  textSecondary: '#AEBAC1',
  textMuted: '#8696A0',
  primary: '#4DA3F5',
  onPrimary: '#06223F',
  primaryContainer: '#123A5E',
  onPrimaryContainer: '#D8EAFD',
  brand: '#E9EDEF',
  danger: '#F87171',
  success: '#4ADE80',
  warning: '#FBBF24',
  unreadBadge: '#4DA3F5',
  chatBackground: '#0B141A',
  bubbleIncoming: '#202C33',
  bubbleOutgoing: '#0F4C81',
  bubbleIncomingText: '#E9EDEF',
  bubbleOutgoingText: '#E9EDEF',
  quoteBackground: 'rgba(0, 0, 0, 0.22)',
  link: '#7CC0FF',
  chip: '#202C33',
  chipText: '#AEBAC1',
  fab: '#4DA3F5',
  onFab: '#06223F',
  scrim: 'rgba(0, 0, 0, 0.5)',
};

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const Radius = {
  sm: 6,
  md: 10,
  lg: 16,
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
