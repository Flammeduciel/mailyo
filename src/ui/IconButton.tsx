import { MaterialIcons } from '@expo/vector-icons';
import { Pressable, StyleSheet } from 'react-native';

import { Radius, Spacing, useAppTheme } from './theme';

export interface IconButtonProps {
  /** SF Symbol name; used for iOS and mapped through to Android/web as a fallback. */
  icon: string;
  onPress: () => void;
  accessibilityLabel: string;
  size?: number;
  color?: string;
  testID?: string;
}

export function IconButton({
  icon,
  onPress,
  accessibilityLabel,
  size = 20,
  color,
  testID,
}: IconButtonProps) {
  const colors = useAppTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={Spacing.sm}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [styles.base, pressed && styles.pressed]}
    >
      <MaterialIcons name={icon as any} size={size} color={color ?? colors.text} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.sm,
    borderRadius: Radius.pill,
  },
  pressed: {
    opacity: 0.6,
  },
});
