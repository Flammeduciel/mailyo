import { MaterialIcons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import type { PermissionId, PermissionState } from '@/state/use-permissions';
import { AppText, Radius, Spacing, useAppTheme } from '@/ui';

export interface PermissionListProps {
  states: PermissionState[];
  onRequest: (id: PermissionId) => void;
}

/** One card per permission: what it is for, its state, and a button to grant it. */
export function PermissionList({ states, onRequest }: PermissionListProps) {
  const colors = useAppTheme();
  const shown = states.filter((state) => state.granted !== null);
  return (
    <View style={styles.list}>
      {shown.map((state) => {
        const granted = state.granted === true;
        const missingVital = !granted && state.vital;
        return (
          <View
            key={state.id}
            style={[styles.card, { backgroundColor: colors.card, borderColor: colors.separator }]}
            testID={`permission-${state.id}`}
          >
            <View
              style={[
                styles.icon,
                {
                  backgroundColor: granted
                    ? colors.primaryContainer
                    : missingVital
                      ? colors.dangerContainer
                      : colors.surfaceAlt,
                },
              ]}
            >
              <MaterialIcons
                name={state.icon as never}
                size={22}
                color={
                  granted ? colors.primary : missingVital ? colors.danger : colors.textSecondary
                }
              />
            </View>
            <View style={styles.text}>
              <View style={styles.titleRow}>
                <AppText weight="semibold">{state.label}</AppText>
                {state.vital ? (
                  <AppText variant="caption" weight="semibold" color="textMuted">
                    · essentiel
                  </AppText>
                ) : null}
              </View>
              <AppText variant="caption" color="textSecondary" style={styles.description}>
                {state.description}
              </AppText>
            </View>
            {granted ? (
              <View style={[styles.status, { backgroundColor: colors.surfaceAlt }]}>
                <MaterialIcons name="check" size={16} color={colors.success} />
                <AppText variant="caption" weight="semibold" style={{ color: colors.success }}>
                  Accordée
                </AppText>
              </View>
            ) : (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Autoriser : ${state.label}`}
                onPress={() => onRequest(state.id)}
                testID={`permission-${state.id}-grant`}
                style={({ pressed }) => [
                  styles.grant,
                  { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 },
                ]}
              >
                <AppText variant="caption" weight="semibold" style={{ color: colors.onPrimary }}>
                  Autoriser
                </AppText>
              </Pressable>
            )}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: Spacing.sm,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.md,
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  icon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    flex: 1,
    gap: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexWrap: 'wrap',
  },
  description: {
    lineHeight: 18,
  },
  status: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 5,
    borderRadius: Radius.pill,
  },
  grant: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm - 1,
    borderRadius: Radius.pill,
  },
});
