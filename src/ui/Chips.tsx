import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from './AppText';
import { Spacing, useAppTheme } from './theme';

export interface ChipOption<T extends string> {
  value: T;
  label: string;
}

export interface ChipsProps<T extends string> {
  options: ChipOption<T>[];
  value: T;
  onChange: (value: T) => void;
}

/** Single-select pill group: a compact replacement for a picker. */
export function Chips<T extends string>({ options, value, onChange }: ChipsProps<T>) {
  const theme = useAppTheme();

  return (
    <View style={styles.row}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            onPress={() => onChange(option.value)}
            style={[
              styles.chip,
              {
                borderColor: selected ? theme.primary : theme.border,
                backgroundColor: selected ? theme.primary : theme.surface,
              },
            ]}
          >
            <AppText variant="caption" weight="medium" color={selected ? 'onPrimary' : 'text'}>
              {option.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  chip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
});
