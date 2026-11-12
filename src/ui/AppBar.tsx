import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from './AppText';
import { IconButton } from './IconButton';
import { FontSize, Spacing, useAppTheme } from './theme';

export interface AppBarAction {
  icon: string;
  label: string;
  onPress: () => void;
  color?: string;
  testID?: string;
  /** Small red dot on the icon (something needs attention behind it). */
  alert?: boolean;
}

export interface AppBarProps {
  /** Large brand title (main tabs) or regular title (sub screens). */
  title: string;
  variant?: 'brand' | 'regular';
  subtitle?: string;
  onBack?: () => void;
  /** Element shown between the back arrow and the title (avatar). */
  leading?: ReactNode;
  actions?: AppBarAction[];
  /** Pressing the title area (e.g. open contact details). */
  onTitlePress?: () => void;
  backgroundColor?: string;
}

/** Android messaging-style top app bar: brand title left, icon actions right. */
export function AppBar({
  title,
  variant = 'regular',
  subtitle,
  onBack,
  leading,
  actions = [],
  onTitlePress,
  backgroundColor,
}: AppBarProps) {
  const colors = useAppTheme();
  const isBrand = variant === 'brand';
  const bar = backgroundColor ?? colors.background;

  return (
    <View style={[styles.bar, { backgroundColor: backgroundColor ?? colors.background }]}>
      {onBack ? (
        <IconButton
          icon="arrow-back"
          accessibilityLabel="Retour"
          onPress={onBack}
          size={24}
          testID="appbar-back"
        />
      ) : null}
      {leading}
      <Pressable
        onPress={onTitlePress}
        disabled={!onTitlePress}
        accessibilityRole={onTitlePress ? 'button' : undefined}
        style={[styles.titles, !onBack && !leading && styles.titlesInset]}
      >
        <AppText
          numberOfLines={1}
          weight={isBrand ? 'bold' : 'semibold'}
          style={[
            { color: isBrand ? colors.brand : colors.text },
            isBrand ? styles.brand : styles.regular,
          ]}
        >
          {title}
        </AppText>
        {subtitle ? (
          <AppText variant="caption" color="textSecondary" numberOfLines={1}>
            {subtitle}
          </AppText>
        ) : null}
      </Pressable>
      <View style={styles.actions}>
        {actions.map((action) => (
          <View key={action.icon + action.label}>
            <IconButton
              icon={action.icon}
              accessibilityLabel={action.alert ? `${action.label} (action requise)` : action.label}
              onPress={action.onPress}
              color={action.color}
              size={24}
              testID={action.testID}
            />
            {action.alert ? (
              <View
                pointerEvents="none"
                testID={action.testID ? `${action.testID}-alert` : undefined}
                style={[styles.alert, { backgroundColor: colors.danger, borderColor: bar }]}
              />
            ) : null}
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.xs,
    gap: Spacing.xs,
  },
  titles: {
    flex: 1,
    justifyContent: 'center',
  },
  titlesInset: {
    paddingLeft: Spacing.md,
  },
  brand: {
    fontSize: 26,
    lineHeight: 32,
    letterSpacing: -0.6,
  },
  regular: {
    fontSize: FontSize.lg,
    lineHeight: 24,
    letterSpacing: -0.2,
  },
  alert: {
    position: 'absolute',
    top: 9,
    right: 9,
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});
