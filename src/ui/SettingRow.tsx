import { SymbolView, type AndroidSymbol, type SFSymbol } from 'expo-symbols';
import { Pressable, StyleSheet, Switch, View } from 'react-native';

import { AppText } from './AppText';
import { FontSize, Spacing, useAppTheme } from './theme';

export interface SettingRowProps {
  label: string;
  description?: string;
  value?: boolean;
  onValueChange?: (value: boolean) => void;
  onPress?: () => void;
  /** Optional leading SF Symbol name. */
  icon?: string;
}

export function SettingRow({
  label,
  description,
  value,
  onValueChange,
  onPress,
  icon,
}: SettingRowProps) {
  const colors = useAppTheme();
  const hasSwitch = typeof value === 'boolean' && typeof onValueChange === 'function';

  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: pressed && onPress ? colors.surfaceAlt : colors.background },
      ]}
    >
      {icon ? (
        <SymbolView
          name={{
            ios: icon as SFSymbol,
            android: icon as AndroidSymbol,
            web: icon as AndroidSymbol,
          }}
          size={FontSize.lg}
          tintColor={colors.textSecondary}
          fallback={<View style={{ width: FontSize.lg, height: FontSize.lg }} />}
        />
      ) : null}

      <View style={styles.content}>
        <AppText variant="body" weight="medium">
          {label}
        </AppText>
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
          trackColor={{ false: colors.border, true: colors.primary }}
          thumbColor={colors.surface}
        />
      ) : onPress ? (
        <SymbolView
          name={{
            ios: 'chevron.right',
            android: 'chevron_right' as AndroidSymbol,
            web: 'chevron_right' as AndroidSymbol,
          }}
          size={FontSize.md}
          tintColor={colors.textMuted}
          fallback={<View style={{ width: FontSize.md, height: FontSize.md }} />}
        />
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    gap: Spacing.md,
  },
  content: {
    flex: 1,
    gap: Spacing.xs,
  },
});
