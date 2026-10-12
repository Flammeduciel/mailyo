import { SymbolView, type AndroidSymbol, type SFSymbol } from 'expo-symbols';
import { Pressable, StyleSheet, View } from 'react-native';

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
      <SymbolView
        name={{ ios: icon as SFSymbol, android: icon as AndroidSymbol, web: icon as AndroidSymbol }}
        size={size}
        tintColor={color ?? colors.text}
        fallback={<View style={{ width: size, height: size }} />}
      />
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
