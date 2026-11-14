import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PermissionList } from '@/screens/PermissionList';
import { useApp } from '@/state/app-context';
import { usePermissions } from '@/state/use-permissions';
import { AppText, Radius, Spacing, useAppTheme } from '@/ui';

/**
 * First launch: explains why Wouah Mail needs notifications and an unrestricted
 * battery (the near-instant delivery only holds while Android keeps it alive),
 * and asks for them before the inbox.
 */
export default function WelcomeScreen() {
  const colors = useAppTheme();
  const { service, invalidate } = useApp();
  const realtimeOn = service.getSettings().realtimeMode === 'idle';
  const { states, request, missingVital } = usePermissions(realtimeOn);

  const finish = () => {
    void (async () => {
      await service.updateSettings({ permissionsIntroDone: true });
      // Channels and the real-time service pick the new permissions up.
      await service.ensureNotificationsConfigured();
      invalidate();
      router.replace('/discussions');
    })();
  };

  return (
    <SafeAreaView
      edges={['top', 'bottom']}
      style={[styles.screen, { backgroundColor: colors.groupedBackground }]}
    >
      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.hero, { backgroundColor: colors.primaryContainer }]}>
          <MaterialIcons name="mark-email-unread" size={40} color={colors.primary} />
        </View>
        <AppText weight="bold" style={styles.title}>
          Bienvenue sur Wouah Mail
        </AppText>
        <AppText color="textSecondary" style={styles.lead}>
          Vos mails arrivent comme des messages. Pour qu’ils sonnent dès leur arrivée, Wouah Mail a
          besoin de quelques autorisations.
        </AppText>

        <PermissionList states={states} onRequest={(id) => void request(id)} />

        <View
          style={[styles.note, { backgroundColor: colors.card, borderColor: colors.separator }]}
        >
          <MaterialIcons name="lock-outline" size={18} color={colors.textSecondary} />
          <AppText variant="caption" color="textSecondary" style={styles.noteText}>
            Vos mails restent chez votre messagerie : Wouah Mail s’y connecte directement depuis ce
            téléphone, sans serveur intermédiaire.
          </AppText>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <Pressable
          accessibilityRole="button"
          onPress={finish}
          testID="welcome-continue"
          style={({ pressed }) => [
            styles.primary,
            { backgroundColor: colors.primary, opacity: pressed ? 0.88 : 1 },
          ]}
        >
          <AppText weight="semibold" style={{ color: colors.onPrimary }}>
            {missingVital ? 'Continuer quand même' : 'Continuer'}
          </AppText>
        </Pressable>
        {missingVital ? (
          <AppText variant="caption" color="textMuted" style={styles.later}>
            Vous pourrez les accorder plus tard dans Paramètres › Autorisations.
          </AppText>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: {
    padding: Spacing.xl,
    paddingTop: Spacing.xxl,
    gap: Spacing.lg,
  },
  hero: {
    width: 80,
    height: 80,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  title: {
    fontSize: 26,
    lineHeight: 32,
    letterSpacing: -0.5,
    textAlign: 'center',
  },
  lead: {
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: Spacing.sm,
  },
  note: {
    flexDirection: 'row',
    gap: Spacing.sm,
    padding: Spacing.md,
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  noteText: {
    flex: 1,
    lineHeight: 18,
  },
  footer: {
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.lg,
    paddingTop: Spacing.sm,
    gap: Spacing.sm,
  },
  primary: {
    height: 52,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  later: {
    textAlign: 'center',
  },
});
