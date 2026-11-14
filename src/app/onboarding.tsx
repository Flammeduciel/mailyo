import { router } from 'expo-router';
import { ScrollView, StyleSheet } from 'react-native';

import { PermissionList } from '@/screens/PermissionList';
import { useApp } from '@/state/app-context';
import { usePermissions } from '@/state/use-permissions';
import { AppText, Header, Screen, Spacing, useAppTheme } from '@/ui';

/** « Réception en arrière-plan »: the live state of what Wouah Mail needs to ring on time. */
export default function OnboardingScreen() {
  const colors = useAppTheme();
  const { service } = useApp();
  const { states, request } = usePermissions(service.getSettings().realtimeMode === 'idle');

  return (
    <Screen>
      <Header title="Réception en arrière-plan" onBack={() => router.back()} />
      <ScrollView
        style={{ backgroundColor: colors.groupedBackground }}
        contentContainerStyle={styles.content}
      >
        <AppText color="textSecondary" style={styles.intro}>
          Wouah Mail se connecte directement à votre boîte. Pour qu’un mail sonne dès son arrivée,
          Android doit laisser l’application travailler en arrière-plan.
        </AppText>
        <PermissionList states={states} onRequest={(id) => void request(id)} />
        <AppText variant="caption" color="textMuted" style={styles.note}>
          Les notifications instantanées se règlent dans Paramètres › Notifications.
        </AppText>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: Spacing.lg,
    gap: Spacing.md,
    paddingBottom: Spacing.xxl,
  },
  intro: {
    paddingHorizontal: Spacing.xs,
    lineHeight: 22,
  },
  note: {
    paddingHorizontal: Spacing.xs,
    textAlign: 'center',
  },
});
