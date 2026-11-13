import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { AppText } from './AppText';
import { Radius, Spacing, useAppTheme } from './theme';

/** Quiet loader shown while a conversation opens: a small pill, no fake bubbles. */
export function ThreadSkeleton() {
  const colors = useAppTheme();
  return (
    <View style={styles.container} testID="thread-loading">
      <View
        style={[styles.pill, { backgroundColor: colors.surface, borderColor: colors.separator }]}
      >
        <ActivityIndicator size="small" color={colors.primary} />
        <AppText variant="caption" weight="medium" color="textSecondary">
          Ouverture de la conversation…
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm + 2,
    borderRadius: Radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
