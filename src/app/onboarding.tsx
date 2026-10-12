import { router } from 'expo-router';
import { useState } from 'react';
import { Linking, ScrollView, StyleSheet, View } from 'react-native';

import { useApp } from '@/state/app-context';
import { registerBackgroundSync } from '@/sync/background-sync';
import { AppText, Button, Header, Screen, SectionTitle, Spacing } from '@/ui';

type StepState = 'idle' | 'done' | 'failed';

export default function OnboardingScreen() {
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
      <Header title="Recevoir en temps réel" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={styles.content}>
        <SectionIntro />
        <SectionTitle title="Étapes" />
        <Step
          title="Autoriser les notifications"
          description="Sans cette autorisation, aucun message ne peut vous alerter."
          state={notifications}
          actionLabel="Autoriser"
          onAction={enableNotifications}
        />
        <Step
          title="Désactiver l’optimisation de la batterie"
          description="Android suspend les apps en arrière-plan. Autorisez MailYo à rester actif dans les réglages système."
          actionLabel="Ouvrir les réglages"
          onAction={() => {
            void Linking.openSettings();
          }}
        />
        <Step
          title="Activer la synchronisation en arrière-plan"
          description="Relève les nouveaux messages à intervalle régulier, même app fermée."
          state={background}
          actionLabel="Activer"
          onAction={enableBackground}
        />
        <SectionTitle title="Temps réel (IMAP IDLE)" />
        <AppText variant="body" color="textSecondary" style={styles.note}>
          La réception instantanée par IMAP IDLE nécessite un service de premier plan natif, ajouté au
          build de développement. En attendant, la synchronisation périodique suffit à recevoir vos
          messages avec quelques minutes de décalage.
        </AppText>
      </ScrollView>
    </Screen>
  );
}

function SectionIntro() {
  return (
    <AppText variant="body" color="textSecondary" style={styles.intro}>
      MailYo se connecte directement à votre boîte. Pour qu’un email déclenche une notification
      fiable, Android doit autoriser l’application à travailler en arrière-plan.
    </AppText>
  );
}

function Step({
  title,
  description,
  state = 'idle',
  actionLabel,
  onAction,
}: {
  title: string;
  description: string;
  state?: StepState;
  actionLabel: string;
  onAction: () => void | Promise<void>;
}) {
  const label = state === 'done' ? 'Activé' : state === 'failed' ? 'Réessayer' : actionLabel;
  return (
    <View style={styles.step}>
      <AppText variant="body" weight="semibold">
        {title}
      </AppText>
      <AppText variant="caption" color="textSecondary">
        {description}
      </AppText>
      <Button
        label={label}
        variant={state === 'done' ? 'secondary' : 'primary'}
        onPress={() => {
          void onAction();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingBottom: Spacing.xxl,
  },
  intro: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
  },
  note: {
    paddingHorizontal: Spacing.lg,
  },
  step: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    gap: Spacing.sm,
  },
});
