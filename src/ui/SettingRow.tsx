import { MaterialIcons } from '@expo/vector-icons';
import { Children, Fragment, isValidElement, type ReactNode } from 'react';
import { Pressable, StyleSheet, Switch, View } from 'react-native';

import { AppText } from './AppText';
import { AvatarTints, FontSize, Radius, Spacing, useAppTheme } from './theme';
import { useResolvedScheme } from './theme-preference';

/** Colour of the small rounded tile behind a setting's icon. */
export type SettingTone =
  'indigo' | 'green' | 'orange' | 'rose' | 'violet' | 'blue' | 'olive' | 'gray';

const TONE_INDEX: Record<SettingTone, number> = {
  indigo: 0,
  green: 1,
  orange: 2,
  rose: 3,
  violet: 4,
  blue: 5,
  olive: 6,
  gray: 7,
};

export interface SettingRowProps {
  label: string;
  description?: string;
  /** Short current value shown on the right ("Clair", "3 Mo"). */
  detail?: string;
  value?: boolean;
  onValueChange?: (value: boolean) => void;
  onPress?: () => void;
  /** Optional leading Material icon name. */
  icon?: string;
  tone?: SettingTone;
  destructive?: boolean;
  /** Muted row for something not available yet. */
  disabled?: boolean;
  testID?: string;
}

/** Settings row: tinted icon tile, title, muted description, value/switch/chevron. */
export function SettingRow({
  label,
  description,
  detail,
  value,
  onValueChange,
  onPress,
  icon,
  tone = 'indigo',
  destructive = false,
  disabled = false,
  testID,
}: SettingRowProps) {
  const colors = useAppTheme();
  const scheme = useResolvedScheme();
  const hasSwitch = typeof value === 'boolean';
  const tint = AvatarTints[scheme === 'dark' ? 'dark' : 'light'][TONE_INDEX[tone]];
  const tileBg = destructive ? colors.dangerContainer : tint.bg;
  const tileFg = destructive ? colors.danger : tint.fg;

  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : hasSwitch ? 'switch' : undefined}
      accessibilityState={hasSwitch ? { checked: value, disabled } : { disabled }}
      onPress={onPress ?? (hasSwitch && onValueChange ? () => onValueChange(!value) : undefined)}
      disabled={!onPress && !(hasSwitch && onValueChange)}
      testID={testID}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: pressed ? colors.surfaceAlt : 'transparent' },
        disabled && styles.disabled,
      ]}
    >
      {icon ? (
        <View style={[styles.tile, { backgroundColor: tileBg }]}>
          <MaterialIcons name={icon as never} size={19} color={tileFg} />
        </View>
      ) : null}

      <View style={styles.content}>
        <AppText weight="medium" style={[styles.label, destructive && { color: colors.danger }]}>
          {label}
        </AppText>
        {description ? (
          <AppText variant="caption" color="textSecondary" style={styles.description}>
            {description}
          </AppText>
        ) : null}
      </View>

      {detail ? (
        <AppText variant="caption" color="textMuted" numberOfLines={1} style={styles.detail}>
          {detail}
        </AppText>
      ) : null}

      {hasSwitch ? (
        <Switch
          value={value}
          onValueChange={onValueChange}
          disabled={!onValueChange}
          trackColor={{ false: colors.border, true: colors.primary }}
          thumbColor={
            value ? colors.onPrimary : scheme === 'dark' ? colors.textSecondary : '#FFFFFF'
          }
          // Web: keep the thumb white instead of the browser's accent colour.
          {...({ activeThumbColor: colors.onPrimary } as object)}
        />
      ) : onPress ? (
        <MaterialIcons name="chevron-right" size={22} color={colors.textMuted} />
      ) : null}
    </Pressable>
  );
}

export interface SettingsGroupProps {
  title?: string;
  /** Small explanatory text under the card. */
  footer?: string;
  children: ReactNode;
}

/** Rounded card holding setting rows, separated by inset hairlines. */
export function SettingsGroup({ title, footer, children }: SettingsGroupProps) {
  const colors = useAppTheme();
  const rows = Children.toArray(children).filter(isValidElement);
  return (
    <View style={styles.group}>
      {title ? (
        <AppText variant="caption" weight="semibold" color="textSecondary" style={styles.title}>
          {title.toUpperCase()}
        </AppText>
      ) : null}
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.separator }]}>
        {rows.map((row, index) => (
          <Fragment key={row.key ?? index}>
            {index > 0 ? (
              <View style={[styles.separator, { backgroundColor: colors.separator }]} />
            ) : null}
            {row}
          </Fragment>
        ))}
      </View>
      {footer ? (
        <AppText variant="caption" color="textMuted" style={styles.footer}>
          {footer}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 56,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    gap: Spacing.md + 2,
  },
  disabled: {
    opacity: 0.55,
  },
  tile: {
    width: 32,
    height: 32,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
    gap: 1,
  },
  label: {
    fontSize: FontSize.md,
    lineHeight: 21,
  },
  description: {
    lineHeight: 18,
  },
  detail: {
    maxWidth: 140,
    textAlign: 'right',
  },
  group: {
    paddingHorizontal: Spacing.lg,
    marginTop: Spacing.xl,
  },
  title: {
    letterSpacing: 0.8,
    fontSize: 12,
    paddingHorizontal: Spacing.xs,
    paddingBottom: Spacing.sm,
  },
  card: {
    borderRadius: Radius.lg,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: Spacing.lg + 32 + Spacing.md + 2,
  },
  footer: {
    paddingHorizontal: Spacing.xs,
    paddingTop: Spacing.sm,
    lineHeight: 18,
  },
});
