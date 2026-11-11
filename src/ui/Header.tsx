import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from './AppText';
import { IconButton } from './IconButton';
import { Radius, Spacing, useAppTheme } from './theme';

export interface HeaderProps {
  title: string;
  onBack?: () => void;
  right?: ReactNode;
  subtitle?: string;
}

export function Header({ title, onBack, right, subtitle }: HeaderProps) {
  const colors = useAppTheme();

  return (
    <View style={[styles.header, { borderBottomColor: colors.border }]}>
      <View style={styles.side}>
        {onBack ? (
          <IconButton
            icon="chevron-left"
            accessibilityLabel="Retour"
            onPress={onBack}
            testID="header-back"
          />
        ) : null}
      </View>

      <View style={styles.center}>
        <AppText variant="subtitle" weight="semibold" numberOfLines={1}>
          {title}
        </AppText>
        {subtitle ? (
          <AppText variant="caption" color="textSecondary" numberOfLines={1}>
            {subtitle}
          </AppText>
        ) : null}
      </View>

      <View style={[styles.side, styles.right]}>{right}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomLeftRadius: Radius.md,
    borderBottomRightRadius: Radius.md,
  },
  side: {
    minWidth: Spacing.xxl,
    flexDirection: 'row',
    alignItems: 'center',
  },
  right: {
    justifyContent: 'flex-end',
  },
  center: {
    flex: 1,
    alignItems: 'center',
  },
});
