import { Platform, StyleSheet, Text, type StyleProp, type TextStyle } from 'react-native';

import { FontSize, useAppTheme, type AppColors } from './theme';

export type AppTextVariant = 'body' | 'caption' | 'label' | 'title' | 'subtitle' | 'mono';
export type AppTextWeight = 'regular' | 'medium' | 'semibold' | 'bold';

export interface AppTextProps {
  children?: React.ReactNode;
  variant?: AppTextVariant;
  color?: keyof AppColors;
  weight?: AppTextWeight;
  numberOfLines?: number;
  style?: StyleProp<TextStyle>;
  testID?: string;
}

const FONT_WEIGHTS: Record<AppTextWeight, TextStyle['fontWeight']> = {
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
};

const VARIANT_FONT_SIZES: Record<AppTextVariant, number> = {
  body: FontSize.md,
  caption: FontSize.sm,
  label: FontSize.sm,
  title: FontSize.xl,
  subtitle: FontSize.lg,
  mono: FontSize.sm,
};

export function AppText({
  children,
  variant = 'body',
  color = 'text',
  weight = 'regular',
  numberOfLines,
  style,
  testID,
}: AppTextProps) {
  const colors = useAppTheme();
  const fontSize = VARIANT_FONT_SIZES[variant];

  return (
    <Text
      numberOfLines={numberOfLines}
      testID={testID}
      style={[
        styles.base,
        { fontSize, lineHeight: Math.round(fontSize * 1.4), color: colors[color] },
        variant === 'label' && styles.label,
        variant === 'mono' && styles.mono,
        { fontWeight: FONT_WEIGHTS[weight] },
        style,
      ]}
    >
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  base: {
    fontWeight: '400',
  },
  label: {
    letterSpacing: 0.4,
  },
  mono: {
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
  },
});
