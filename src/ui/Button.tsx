import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { AppText } from './AppText';
import { Radius, Spacing, useAppTheme, type AppColors } from './theme';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}

const TEXT_COLORS: Record<ButtonVariant, keyof AppColors> = {
  primary: 'onPrimary',
  secondary: 'text',
  ghost: 'primary',
  danger: 'onPrimary',
};

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
  fullWidth = false,
  testID,
  style,
}: ButtonProps) {
  const colors = useAppTheme();
  const isDisabled = disabled || loading;

  const backgroundStyles: Record<ButtonVariant, StyleProp<ViewStyle>> = {
    primary: { backgroundColor: colors.primary },
    secondary: { backgroundColor: colors.surfaceAlt, borderColor: colors.border, borderWidth: 1 },
    ghost: { backgroundColor: 'transparent' },
    danger: { backgroundColor: colors.danger },
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      disabled={isDisabled}
      onPress={isDisabled ? undefined : onPress}
      testID={testID}
      style={({ pressed }) => [
        styles.base,
        backgroundStyles[variant],
        fullWidth && styles.fullWidth,
        isDisabled && styles.disabled,
        pressed && !isDisabled && styles.pressed,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator
          color={variant === 'secondary' || variant === 'ghost' ? colors.primary : colors.onPrimary}
          testID={testID ? `${testID}-loading` : undefined}
        />
      ) : (
        <AppText variant="body" weight="semibold" color={TEXT_COLORS[variant]}>
          {label}
        </AppText>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderRadius: Radius.md,
    gap: Spacing.sm,
  },
  fullWidth: {
    alignSelf: 'stretch',
  },
  disabled: {
    opacity: 0.5,
  },
  pressed: {
    opacity: 0.85,
  },
});
