import { MaterialIcons } from '@expo/vector-icons';
import { useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';

import { useAppTheme } from './theme';

export interface AvatarProps {
  /** Display name; used as the accessibility label. */
  name: string;
  size?: number;
  /** Photo from Google: the person's own, or the letter avatar Google generates. */
  imageUri?: string;
}

/**
 * Shows the image Google provides. The app draws no avatar of its own: a sender
 * Google knows nothing about gets a neutral silhouette.
 */
export function Avatar({ name, size = 40, imageUri }: AvatarProps) {
  const colors = useAppTheme();
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

  return (
    <View
      accessibilityLabel={name}
      testID="avatar-placeholder"
      style={[styles.avatar, shape, { backgroundColor: colors.surfaceAlt }]}
    >
      <MaterialIcons name="person" size={size * 0.62} color={colors.textMuted} />
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
