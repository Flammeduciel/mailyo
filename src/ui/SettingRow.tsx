import { MaterialIcons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Switch, View } from 'react-native';

import { AppText } from './AppText';
import { FontSize, Spacing, useAppTheme } from './theme';

export interface SettingRowProps {
  label: string;
  description?: string;
  value?: boolean;
  onValueChange?: (value: boolean) => void;
  onPress?: () => void;
  /** Optional leading Material icon name. */
  icon?: string;
  destructive?: boolean;
  testID?: string;
}

/** Settings list row: leading icon, title, muted description, optional switch. */
export function SettingRow({
  label,
  description,
  value,
  onValueChange,
  onPress,
  icon,
  destructive = false,
  testID,
}: SettingRowProps) {
  const colors = useAppTheme();
  const hasSwitch = typeof value === 'boolean';

  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : hasSwitch ? 'switch' : undefined}
      onPress={onPress ?? (hasSwitch && onValueChange ? () => onValueChange(!value) : undefined)}
      disabled={!onPress && !(hasSwitch && onValueChange)}
      testID={testID}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: pressed ? colors.surfaceAlt : 'transparent' },
      ]}
    >
      <View style={styles.iconSlot}>
        {icon ? (
          <MaterialIcons
            name={icon as never}
            size={24}
            color={destructive ? colors.danger : colors.textSecondary}
          />
        ) : null}
      </View>

      <View style={styles.content}>
        <AppText style={[styles.label, destructive && { color: colors.danger }]}>{label}</AppText>
        {description ? (
          <AppText variant="caption" color="textSecondary">
            {description}
          </AppText>
        ) : null}
      </View>

      {hasSwitch ? (
        <Switch
          value={value}
          onValueChange={onValueChange}
          disabled={!onValueChange}
          trackColor={{ false: colors.border, true: colors.primary }}
          thumbColor={colors.surface}
        />
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 64,
    paddingVertical: Spacing.md,
    paddingRight: Spacing.lg,
  },
  iconSlot: {
    width: 64,
    alignItems: 'center',
  },
  content: {
    flex: 1,
    gap: 2,
  },
  label: {
    fontSize: FontSize.md + 1,
  },
});
