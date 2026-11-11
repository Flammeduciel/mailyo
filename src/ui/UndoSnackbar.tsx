import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from './AppText';
import { Radius, Spacing } from './theme';

export interface UndoSnackbarProps {
  message: string;
  onUndo: () => void;
  testID?: string;
}

/** Dark floating bar with an "Annuler" action. */
export function UndoSnackbar({ message, onUndo, testID }: UndoSnackbarProps) {
  return (
    <View style={styles.bar} testID={testID}>
      <AppText variant="body" style={styles.text}>
        {message}
      </AppText>
      <Pressable onPress={onUndo} hitSlop={Spacing.sm} accessibilityRole="button">
        <AppText variant="body" weight="semibold" style={styles.action}>
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
    backgroundColor: '#323232',
    elevation: 6,
  },
  text: { color: '#FFFFFF', flex: 1 },
  action: { color: '#8AB4F8' },
});
