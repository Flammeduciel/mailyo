import { SymbolView, type AndroidSymbol, type SFSymbol } from 'expo-symbols';
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

export function EmptyState({ icon = 'tray', title, description, action, testID }: EmptyStateProps) {
  const colors = useAppTheme();

  return (
    <View style={styles.container} testID={testID}>
      <SymbolView
        name={{
          ios: icon as SFSymbol,
          android: 'inbox' as AndroidSymbol,
          web: 'inbox' as AndroidSymbol,
        }}
        size={FontSize.xxl}
        tintColor={colors.textMuted}
        fallback={<View style={{ height: FontSize.xxl }} />}
      />
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
  },
  action: {
    marginTop: Spacing.md,
  },
});
