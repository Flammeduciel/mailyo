/**
 * MailChat design system — colours, spacing, radii and typography scale.
 *
 * A classic, sober palette: neutral grey surfaces with a single blue accent.
 * No external dependency; light/dark follow the device or the user's preference.
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
  danger: string;
  success: string;
  warning: string;
  unreadBadge: string;
  bubbleIncoming: string;
  bubbleOutgoing: string;
  bubbleIncomingText: string;
  bubbleOutgoingText: string;
}

export const LightColors: AppColors = {
  background: '#FFFFFF',
  surface: '#FFFFFF',
  surfaceAlt: '#F4F5F7',
  border: '#E3E5E9',
  text: '#1A1D21',
  textSecondary: '#5B636E',
  textMuted: '#9AA0A8',
  primary: '#2563EB',
  onPrimary: '#FFFFFF',
  danger: '#DC2626',
  success: '#16A34A',
  warning: '#D97706',
  unreadBadge: '#2563EB',
  bubbleIncoming: '#F1F3F5',
  bubbleOutgoing: '#2563EB',
  bubbleIncomingText: '#1A1D21',
  bubbleOutgoingText: '#FFFFFF',
};

export const DarkColors: AppColors = {
  background: '#0F1114',
  surface: '#16191D',
  surfaceAlt: '#1E2227',
  border: '#2A2F36',
  text: '#F2F3F5',
  textSecondary: '#A8AEB8',
  textMuted: '#6B7280',
  primary: '#3B82F6',
  onPrimary: '#FFFFFF',
  danger: '#F87171',
  success: '#4ADE80',
  warning: '#FBBF24',
  unreadBadge: '#3B82F6',
  bubbleIncoming: '#23272D',
  bubbleOutgoing: '#2563EB',
  bubbleIncomingText: '#F2F3F5',
  bubbleOutgoingText: '#FFFFFF',
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
