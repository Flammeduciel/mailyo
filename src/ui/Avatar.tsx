import { StyleSheet, Text, View } from 'react-native';

import { FontSize, useAppTheme } from './theme';

/**
 * A small set of sober, desaturated avatar colours. The colour is picked
 * deterministically from a hash of the display name so a contact keeps the
 * same colour across renders and sessions.
 */
const AVATAR_PALETTE = [
  '#2563EB',
  '#0F766E',
  '#7C3AED',
  '#B45309',
  '#BE123C',
  '#4338CA',
  '#047857',
  '#9D174D',
] as const;

export interface AvatarProps {
  /** Display name; may also be a raw email address. */
  name: string;
  size?: number;
  backgroundColor?: string;
}

/** Derive 1–2 uppercase initials from a name, falling back to an email letter. */
export function getInitials(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) {
    return '?';
  }

  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  return parts[0][0].toUpperCase();
}

function hashName(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) {
    hash = (hash + name.charCodeAt(i)) % AVATAR_PALETTE.length;
  }
  return hash;
}

export function Avatar({ name, size = 40, backgroundColor }: AvatarProps) {
  const colors = useAppTheme();
  const background = backgroundColor ?? AVATAR_PALETTE[hashName(name)];

  return (
    <View
      style={[
        styles.avatar,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: background },
      ]}
    >
      <Text style={[styles.initials, { fontSize: size * 0.4, color: colors.onPrimary }]}>
        {getInitials(name)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: {
    fontWeight: '600',
  },
});
