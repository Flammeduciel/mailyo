import { MaterialIcons } from '@expo/vector-icons';
import { Pressable, StyleSheet } from 'react-native';

import { AppText } from './AppText';
import { Radius, Spacing, useAppTheme } from './theme';

export interface SearchPillProps {
  placeholder?: string;
  onPress: () => void;
  testID?: string;
}

/** Rounded search field shortcut shown under the app bar; opens the search screen. */
export function SearchPill({ placeholder = 'Rechercher', onPress, testID }: SearchPillProps) {
  const colors = useAppTheme();

  return (
    <Pressable
      accessibilityRole="search"
      accessibilityLabel={placeholder}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        styles.pill,
        { backgroundColor: colors.surfaceAlt, opacity: pressed ? 0.8 : 1 },
      ]}
    >
      <MaterialIcons name="search" size={22} color={colors.textSecondary} />
      <AppText color="textSecondary" numberOfLines={1}>
        {placeholder}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    height: 44,
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    borderRadius: Radius.pill,
  },
});
