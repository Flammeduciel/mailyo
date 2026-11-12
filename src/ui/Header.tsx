import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from './AppText';
import { IconButton } from './IconButton';
import { FontSize, Spacing, useAppTheme } from './theme';

export interface HeaderProps {
  title: string;
  onBack?: () => void;
  right?: ReactNode;
  subtitle?: string;
}

/** Sub-screen header, same look as `AppBar`: back arrow, left-aligned title, actions. */
export function Header({ title, onBack, right, subtitle }: HeaderProps) {
  const colors = useAppTheme();

  return (
    <View style={[styles.header, { backgroundColor: colors.background }]}>
      {onBack ? (
        <IconButton
          icon="arrow-back"
          accessibilityLabel="Retour"
          onPress={onBack}
          size={24}
          testID="header-back"
        />
      ) : null}
      <View style={[styles.titles, !onBack && styles.inset]}>
        <AppText weight="semibold" numberOfLines={1} style={styles.title}>
          {title}
        </AppText>
        {subtitle ? (
          <AppText variant="caption" color="textSecondary" numberOfLines={1}>
            {subtitle}
          </AppText>
        ) : null}
      </View>
      {right ? <View style={styles.right}>{right}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
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
  inset: {
    paddingLeft: Spacing.md,
  },
  title: {
    fontSize: FontSize.lg,
    lineHeight: 24,
    letterSpacing: -0.2,
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: Spacing.sm,
  },
});
