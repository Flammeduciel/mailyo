import { MaterialIcons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from './AppText';
import { FontSize, Spacing, useAppTheme } from './theme';

export interface EmptyStateProps {
  /** SF Symbol name shown above the title. */
  icon?: string;
  title: string;
  description?: string;
  action?: ReactNode;
  testID?: string;
}

export function EmptyState({
  icon = 'inbox',
  title,
  description,
  action,
  testID,
}: EmptyStateProps) {
  const colors = useAppTheme();

  return (
    <View style={styles.container} testID={testID}>
      <View style={[styles.medallion, { backgroundColor: colors.primaryContainer }]}>
        <MaterialIcons name={icon as any} size={FontSize.xxl} color={colors.primary} />
      </View>
      <AppText variant="subtitle" weight="semibold" style={styles.title}>
        {title}
      </AppText>
      {description ? (
        <AppText variant="body" color="textSecondary" style={styles.description}>
          {description}
        </AppText>
      ) : null}
      {action ? <View style={styles.action}>{action}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
    gap: Spacing.sm,
  },
  title: {
    marginTop: Spacing.sm,
    textAlign: 'center',
  },
  description: {
    textAlign: 'center',
    maxWidth: 300,
    lineHeight: 21,
  },
  medallion: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  action: {
    marginTop: Spacing.md,
  },
});
