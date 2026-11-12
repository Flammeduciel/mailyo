import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { useApp } from '@/state/app-context';
import { registerBackgroundSync } from '@/sync/background-sync';
import { AppText, Header, Radius, Screen, Spacing, useAppTheme } from '@/ui';

type StepState = 'idle' | 'done' | 'failed';

export default function OnboardingScreen() {
  const colors = useAppTheme();
  const { service } = useApp();
  const [notifications, setNotifications] = useState<StepState>('idle');
  const [background, setBackground] = useState<StepState>('idle');

  const enableNotifications = async () => {
    const granted = await service.ensureNotificationsConfigured();
    setNotifications(granted ? 'done' : 'failed');
  };

  const enableBackground = async () => {
    const armed = await registerBackgroundSync();
    setBackground(armed ? 'done' : 'failed');
  };

  return (
    <Screen>
      <Header title="Réception en arrière-plan" onBack={() => router.back()} />
      <ScrollView
        style={{ backgroundColor: colors.groupedBackground }}
        contentContainerStyle={styles.content}
      >
        <AppText color="textSecondary" style={styles.intro}>
          MailYo se connecte directement à votre boîte. Pour qu’un mail sonne dès son arrivée,
          Android doit laisser l’application travailler en arrière-plan.
        </AppText>
        <Step
          index={1}
          icon="notifications-active"
          title="Autoriser les notifications"
          description="Sans cette autorisation, aucun mail ne peut vous alerter."
          state={notifications}
          actionLabel="Autoriser"
          onAction={enableNotifications}
        />
        <Step
          index={2}
          icon="battery-charging-full"
          title="Ne pas restreindre la batterie"
          description="Certains téléphones coupent les apps en arrière-plan. Choisissez « Sans restriction » pour MailYo."
          actionLabel="Ouvrir les réglages"
          onAction={() => {
            void Linking.openSettings();
          }}
        />
        <Step
          index={3}
          icon="sync"
          title="Relève de secours"
          description="Vérifie la boîte à intervalle régulier, même si la connexion permanente a été coupée."
          state={background}
          actionLabel="Activer"
          onAction={enableBackground}
        />
        <AppText variant="caption" color="textMuted" style={styles.note}>
          Les notifications instantanées se règlent dans Paramètres › Notifications.
        </AppText>
      </ScrollView>
    </Screen>
  );
}

function Step({
  index,
  icon,
  title,
  description,
  state = 'idle',
  actionLabel,
  onAction,
}: {
  index: number;
  icon: string;
  title: string;
  description: string;
  state?: StepState;
  actionLabel: string;
  onAction: () => void | Promise<void>;
}) {
  const colors = useAppTheme();
  const done = state === 'done';
  const label = done ? 'Activé' : state === 'failed' ? 'Réessayer' : actionLabel;
  return (
    <View style={[styles.step, { backgroundColor: colors.card, borderColor: colors.separator }]}>
      <View style={styles.stepHead}>
        <View
          style={[
            styles.number,
            { backgroundColor: done ? colors.success : colors.primaryContainer },
          ]}
        >
          {done ? (
            <MaterialIcons name="check" size={16} color={colors.onPrimary} />
          ) : (
            <AppText
              weight="bold"
              style={[styles.numberText, { color: colors.onPrimaryContainer }]}
            >
              {index}
            </AppText>
          )}
        </View>
        <AppText weight="semibold" style={styles.stepTitle}>
          {title}
        </AppText>
        <MaterialIcons name={icon as never} size={20} color={colors.textMuted} />
      </View>
      <AppText variant="caption" color="textSecondary" style={styles.stepText}>
        {description}
      </AppText>
      <Pressable
        accessibilityRole="button"
        disabled={done}
        onPress={() => {
          void onAction();
        }}
        style={({ pressed }) => [
          styles.action,
          {
            backgroundColor: done ? colors.surfaceAlt : colors.primary,
            opacity: pressed ? 0.85 : 1,
          },
        ]}
      >
        <AppText
          variant="caption"
          weight="semibold"
          style={{ color: done ? colors.success : colors.onPrimary }}
        >
          {label}
        </AppText>
      </Pressable>
    </View>
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
    paddingBottom: Spacing.xs,
    lineHeight: 22,
  },
  note: {
    paddingHorizontal: Spacing.xs,
    textAlign: 'center',
  },
  step: {
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  stepHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  number: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  numberText: {
    fontSize: 14,
  },
  stepTitle: {
    flex: 1,
  },
  stepText: {
    marginLeft: 28 + Spacing.md,
    lineHeight: 18,
  },
  action: {
    alignSelf: 'flex-start',
    marginLeft: 28 + Spacing.md,
    marginTop: Spacing.xs,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.pill,
  },
});
