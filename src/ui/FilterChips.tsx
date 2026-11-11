import { MaterialIcons } from '@expo/vector-icons';
import { Pressable, ScrollView, StyleSheet } from 'react-native';

import { AppText } from './AppText';
import { Radius, Spacing, useAppTheme } from './theme';

export interface FilterChipOption<T extends string> {
  value: T;
  label: string;
  count?: number;
  /** Material icon shown before the label. */
  icon?: string;
}

export interface FilterChipsProps<T extends string> {
  options: FilterChipOption<T>[];
  value: T;
  onChange: (value: T) => void;
}

/** Horizontal row of pill filters ("Toutes", "Non lus", …) above the list. */
export function FilterChips<T extends string>({ options, value, onChange }: FilterChipsProps<T>) {
  const colors = useAppTheme();

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      // A horizontal ScrollView grows by default: keep the row at its own height.
      style={styles.scroll}
      contentContainerStyle={styles.row}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            onPress={() => onChange(option.value)}
            testID={`filter-${option.value}`}
            style={[
              styles.chip,
              { backgroundColor: selected ? colors.primaryContainer : colors.chip },
            ]}
          >
            {option.icon ? (
              <MaterialIcons
                name={option.icon as keyof typeof MaterialIcons.glyphMap}
                size={15}
                color={selected ? colors.onPrimaryContainer : colors.chipText}
              />
            ) : null}
            <AppText
              variant="caption"
              weight="medium"
              style={{ color: selected ? colors.onPrimaryContainer : colors.chipText }}
            >
              {option.count ? `${option.label} ${option.count}` : option.label}
            </AppText>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flexGrow: 0,
  },
  row: {
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.sm,
  },
  chip: {
    height: 32,
    paddingHorizontal: Spacing.md + 2,
    borderRadius: Radius.pill,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
});
