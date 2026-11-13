import { useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';

import { AppText } from './AppText';
import { AvatarTints } from './theme';
import { useResolvedScheme } from './theme-preference';

export interface AvatarProps {
  /** Display name (or address); used for the initials and the accessibility label. */
  name: string;
  size?: number;
  /** Photo from Google: the person's own, or the letter avatar Google generates. */
  imageUri?: string;
}

/** Up to two initials: "Claire Fontaine" → "CF", "bureau@x.fr" → "B". */
export function avatarInitials(name: string): string {
  const cleaned = name.trim().replace(/^["'(<]+|[">)']+$/g, '');
  if (!cleaned) return '?';
  const local = cleaned.includes('@') && !cleaned.includes(' ') ? cleaned.split('@')[0] : cleaned;
  const words = local
    .split(/[\s._-]+/)
    .map((word) => word.replace(/[^\p{L}\p{N}]/gu, ''))
    .filter(Boolean);
  if (words.length === 0) return '?';
  const isAddress = local !== cleaned;
  const letters = isAddress
    ? [words[0][0]]
    : [words[0][0], words.length > 1 ? words[words.length - 1][0] : ''];
  return letters.join('').toUpperCase();
}

/** Stable tint index for a name, so a person keeps one colour everywhere. */
export function avatarTintIndex(name: string): number {
  let hash = 0;
  for (const char of name.trim().toLowerCase()) {
    hash = (hash * 31 + char.codePointAt(0)!) | 0;
  }
  return Math.abs(hash) % AvatarTints.light.length;
}

/** The Google photo when there is one, otherwise initials on a soft tint. */
export function Avatar({ name, size = 40, imageUri }: AvatarProps) {
  const scheme = useResolvedScheme();
  const [failedUri, setFailedUri] = useState<string | null>(null);
  const shape = { width: size, height: size, borderRadius: size / 2 };

  if (imageUri && imageUri !== failedUri) {
    return (
      <Image
        source={{ uri: imageUri }}
        style={[styles.avatar, shape]}
        accessibilityLabel={name}
        onError={() => setFailedUri(imageUri)}
      />
    );
  }

  const tint = AvatarTints[scheme === 'dark' ? 'dark' : 'light'][avatarTintIndex(name)];
  const initials = avatarInitials(name);
  const fontSize = Math.round(size * (initials.length > 1 ? 0.36 : 0.42));
  return (
    <View
      accessibilityLabel={name}
      testID="avatar-placeholder"
      style={[styles.avatar, shape, { backgroundColor: tint.bg }]}
    >
      <AppText
        weight="semibold"
        style={{
          color: tint.fg,
          fontSize,
          lineHeight: Math.round(fontSize * 1.2),
          letterSpacing: 0.3,
        }}
      >
        {initials}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
});
