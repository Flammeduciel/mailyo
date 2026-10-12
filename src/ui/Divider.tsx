import { StyleSheet, View } from 'react-native';

import { useAppTheme } from './theme';

export interface DividerProps {
  /** Left inset for hairline separators inside list rows. */
  inset?: number;
}

export function Divider({ inset = 0 }: DividerProps) {
  const colors = useAppTheme();

  return (
    <View
      style={[styles.divider, { backgroundColor: colors.border, marginLeft: inset }]}
      accessibilityRole="none"
    />
  );
}

const styles = StyleSheet.create({
  divider: {
    height: StyleSheet.hairlineWidth,
    alignSelf: 'stretch',
  },
});
