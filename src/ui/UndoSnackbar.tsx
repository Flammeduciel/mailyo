import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from './AppText';
import { Radius, Spacing, useAppTheme } from './theme';

export interface UndoSnackbarProps {
  message: string;
  onUndo: () => void;
  testID?: string;
}

/** Dark floating bar with an "Annuler" action. */
export function UndoSnackbar({ message, onUndo, testID }: UndoSnackbarProps) {
  const colors = useAppTheme();
  return (
    <View style={[styles.bar, { backgroundColor: colors.inverseSurface }]} testID={testID}>
      <AppText variant="body" style={[styles.text, { color: colors.onInverseSurface }]}>
        {message}
      </AppText>
      <Pressable onPress={onUndo} hitSlop={Spacing.sm} accessibilityRole="button">
        <AppText variant="body" weight="semibold" style={{ color: colors.inversePrimary }}>
          Annuler
        </AppText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderRadius: Radius.md,
    elevation: 6,
  },
  text: { flex: 1 },
});
