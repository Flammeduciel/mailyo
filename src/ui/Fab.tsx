import { MaterialIcons } from '@expo/vector-icons';
import { Pressable, StyleSheet } from 'react-native';

import { Spacing, useAppTheme } from './theme';

export interface FabProps {
  icon: string;
  accessibilityLabel: string;
  onPress: () => void;
  testID?: string;
}

/** Floating action button, bottom-right, above the tab bar. */
export function Fab({ icon, accessibilityLabel, onPress, testID }: FabProps) {
  const colors = useAppTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        styles.fab,
        { backgroundColor: colors.fab, opacity: pressed ? 0.85 : 1 },
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
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
});
