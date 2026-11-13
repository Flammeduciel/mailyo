import { MaterialIcons } from '@expo/vector-icons';
import { Pressable, StyleSheet } from 'react-native';

import { Spacing, useAppTheme } from './theme';

export interface FabProps {
  icon: string;
  accessibilityLabel: string;
  onPress: () => void;
  testID?: string;
  /** Extra space under it (system navigation bar on screens without a tab bar). */
  bottomInset?: number;
}

/** Floating action button, bottom-right, above the tab bar. */
export function Fab({ icon, accessibilityLabel, onPress, testID, bottomInset = 0 }: FabProps) {
  const colors = useAppTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        styles.fab,
        {
          bottom: Spacing.lg + bottomInset,
          backgroundColor: colors.fab,
          opacity: pressed ? 0.9 : 1,
          transform: [{ scale: pressed ? 0.96 : 1 }],
        },
      ]}
    >
      <MaterialIcons name={icon as never} size={24} color={colors.onFab} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    right: Spacing.lg,
    bottom: Spacing.lg,
    width: 56,
    height: 56,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#1D2780',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.22,
    shadowRadius: 12,
  },
});
