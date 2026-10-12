import { StyleSheet, Text, View } from 'react-native';

import { FontSize, Radius, Spacing, useAppTheme } from './theme';

export interface BadgeProps {
  count: number;
  /** Counts above this render as `${max}+`. Defaults to 99. */
  max?: number;
  testID?: string;
}

export function Badge({ count, max = 99, testID }: BadgeProps) {
  const colors = useAppTheme();

  if (count <= 0) {
    return null;
  }

  return (
    <View style={[styles.badge, { backgroundColor: colors.unreadBadge }]} testID={testID}>
      <Text style={[styles.label, { color: colors.onPrimary }]}>
        {count > max ? `${max}+` : count}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    minWidth: FontSize.lg,
    height: FontSize.lg,
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.xs,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: FontSize.xs,
    fontWeight: '600',
  },
});
