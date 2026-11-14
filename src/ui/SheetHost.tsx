import { MaterialIcons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppText } from './AppText';
import { BottomSheet, type BottomSheetHandle } from './BottomSheet';
import { Radius, Spacing, useAppTheme } from './theme';

/** Same shape as React Native's `AlertButton`, so call sites read the same. */
export interface SheetButton {
  text: string;
  style?: 'default' | 'cancel' | 'destructive';
  onPress?: () => void;
}

export interface SheetChoice<T extends string = string> {
  value: T;
  label: string;
  description?: string;
  icon?: string;
}

type Request =
  | { kind: 'alert'; title: string; message?: string; buttons: SheetButton[]; icon?: string }
  | {
      kind: 'choice';
      title: string;
      message?: string;
      options: SheetChoice[];
      selected?: string;
      onPick: (value: string) => void;
    };

let present: ((request: Request) => void) | null = null;

/**
 * Drop-in for `Alert.alert`: a Wouah Mail bottom sheet with the buttons stacked as
 * pill actions (destructive in red, cancel as a quiet text button).
 */
export function showAlert(
  title: string,
  message?: string,
  buttons: SheetButton[] = [{ text: 'OK' }],
  options?: { icon?: string },
): void {
  present?.({ kind: 'alert', title, message, buttons, icon: options?.icon });
}

/** Single choice list with the current value ticked. */
export function showChoice<T extends string>(
  title: string,
  options: SheetChoice<T>[],
  selected: T | undefined,
  onPick: (value: T) => void,
  message?: string,
): void {
  present?.({
    kind: 'choice',
    title,
    message,
    options,
    selected,
    onPick: onPick as (value: string) => void,
  });
}

/** Mount once near the root: renders the sheets requested via showAlert/showChoice. */
export function SheetHost() {
  const colors = useAppTheme();
  const [request, setRequest] = useState<Request | null>(null);
  const [visible, setVisible] = useState(false);
  const sheet = useRef<BottomSheetHandle>(null);

  useEffect(() => {
    present = (next) => {
      setRequest(next);
      setVisible(true);
    };
    return () => {
      present = null;
    };
  }, []);

  const run = (after?: () => void) => sheet.current?.dismiss(after);

  const actions =
    request?.kind === 'alert'
      ? [
          ...request.buttons.filter((button) => button.style !== 'cancel'),
          ...request.buttons.filter((button) => button.style === 'cancel'),
        ]
      : [];
  const destructive = actions.some((button) => button.style === 'destructive');

  return (
    <BottomSheet
      ref={sheet}
      visible={visible}
      onClose={() => setVisible(false)}
      title={request?.kind === 'choice' ? request.title : undefined}
      subtitle={request?.kind === 'choice' ? request.message : undefined}
      testID="sheet-host"
    >
      {request?.kind === 'alert' ? (
        <View style={styles.alert}>
          {request.icon || destructive ? (
            <View
              style={[
                styles.alertIcon,
                {
                  backgroundColor: destructive ? colors.dangerContainer : colors.primaryContainer,
                },
              ]}
            >
              <MaterialIcons
                name={(request.icon ?? 'delete-outline') as never}
                size={26}
                color={destructive ? colors.danger : colors.primary}
              />
            </View>
          ) : null}
          <AppText weight="semibold" style={styles.alertTitle}>
            {request.title}
          </AppText>
          {request.message ? (
            <AppText color="textSecondary" style={styles.alertMessage}>
              {request.message}
            </AppText>
          ) : null}
          <View style={styles.buttons}>
            {actions.map((button) => {
              const isCancel = button.style === 'cancel';
              const isDanger = button.style === 'destructive';
              return (
                <Pressable
                  key={button.text}
                  accessibilityRole="button"
                  onPress={() => run(button.onPress)}
                  testID={`sheet-button-${button.text}`}
                  style={({ pressed }) => [
                    styles.button,
                    {
                      backgroundColor: isCancel
                        ? 'transparent'
                        : isDanger
                          ? colors.danger
                          : colors.primary,
                      opacity: pressed ? 0.85 : 1,
                    },
                  ]}
                >
                  <AppText
                    weight="semibold"
                    style={{
                      color: isCancel ? colors.textSecondary : colors.onPrimary,
                    }}
                  >
                    {button.text}
                  </AppText>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}

      {request?.kind === 'choice' ? (
        <ScrollView contentContainerStyle={styles.choices}>
          {request.options.map((option) => {
            const checked = option.value === request.selected;
            return (
              <Pressable
                key={option.value}
                accessibilityRole="radio"
                accessibilityState={{ checked }}
                onPress={() => run(() => request.onPick(option.value))}
                testID={`sheet-choice-${option.value}`}
                style={({ pressed }) => [
                  styles.choice,
                  {
                    backgroundColor: checked
                      ? colors.primaryContainer
                      : pressed
                        ? colors.surfaceAlt
                        : 'transparent',
                  },
                ]}
              >
                {option.icon ? (
                  <MaterialIcons
                    name={option.icon as never}
                    size={22}
                    color={checked ? colors.onPrimaryContainer : colors.textSecondary}
                  />
                ) : null}
                <View style={styles.choiceText}>
                  <AppText
                    weight={checked ? 'semibold' : 'medium'}
                    style={{ color: checked ? colors.onPrimaryContainer : colors.text }}
                  >
                    {option.label}
                  </AppText>
                  {option.description ? (
                    <AppText variant="caption" color="textSecondary">
                      {option.description}
                    </AppText>
                  ) : null}
                </View>
                <View
                  style={[styles.radio, { borderColor: checked ? colors.primary : colors.border }]}
                >
                  {checked ? (
                    <View style={[styles.radioDot, { backgroundColor: colors.primary }]} />
                  ) : null}
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  alert: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.sm,
    alignItems: 'center',
    gap: Spacing.sm,
  },
  alertIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.xs,
  },
  alertTitle: {
    fontSize: 18,
    lineHeight: 24,
    textAlign: 'center',
  },
  alertMessage: {
    textAlign: 'center',
    lineHeight: 21,
  },
  buttons: {
    alignSelf: 'stretch',
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  button: {
    height: 50,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  choices: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    gap: 2,
  },
  choice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    minHeight: 54,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.md,
  },
  choiceText: {
    flex: 1,
    gap: 1,
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
});
