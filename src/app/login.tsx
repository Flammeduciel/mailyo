import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { createGmailOAuthAdapter, SecureTokenStore, DEMO_ACCOUNT_ID } from '@/providers';
import { useApp } from '@/state/app-context';
import { useServiceQuery } from '@/state/use-service-query';
import { AppText, Button, Card, Header, Screen, SectionTitle, Spacing } from '@/ui';

/** Configured through `expo.extra.gmailClientId`; empty when the build has none. */
const GMAIL_CLIENT_ID = (Constants.expoConfig?.extra?.gmailClientId as string | undefined) ?? '';

const GMAIL_SCOPES = [
  'https://mail.google.com/',
  'https://www.googleapis.com/auth/userinfo.email',
];

export default function LoginScreen() {
  const { service, invalidate } = useApp();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const { data: accounts } = useServiceQuery((mailService) => mailService.listAccounts(), []);
  const hasDemo = accounts.some((account) => account.id === DEMO_ACCOUNT_ID);

  const connectDemo = useCallback(async () => {
    setBusy(true);
    setMessage(null);
    try {
      await service.connectDemo();
      invalidate();
      router.replace('/(tabs)/inbox');
    } catch (cause: unknown) {
      setMessage(cause instanceof Error ? cause.message : 'Échec de la connexion');
    } finally {
      setBusy(false);
    }
  }, [service, invalidate]);

  const connectGmail = useCallback(async () => {
    setBusy(true);
    setMessage(null);
    try {
      const adapter = createGmailOAuthAdapter({
        clientId: GMAIL_CLIENT_ID,
        redirectUri: '',
        scopes: GMAIL_SCOPES,
      });
      const tokens = await adapter.authorize();
      // Persisting tokens proves the OAuth grant; the IMAP sync that consumes
      // them is the remaining native piece (see README, “Temps réel”).
      const store = new SecureTokenStore();
      await store.save('gmail-pending', tokens);
      setMessage(
        'Autorisation Gmail accordée. La synchronisation IMAP native sera activée dans un prochain build.',
      );
    } catch (cause: unknown) {
      setMessage(cause instanceof Error ? cause.message : 'Autorisation refusée');
    } finally {
      setBusy(false);
    }
  }, []);

  return (
    <Screen>
      <Header title="Ajouter un compte" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={styles.content}>
        <SectionTitle title="Démo" />
        <Card style={styles.card}>
          <AppText variant="body" weight="medium">
            Compte de démonstration
          </AppText>
          <AppText variant="caption" color="textSecondary">
            Quelques conversations d’exemple pour découvrir MailYo sans identifiants.
          </AppText>
          <View style={styles.cardAction}>
            <Button
              label={hasDemo ? 'Ouvrir la boîte de réception' : 'Utiliser le compte de démonstration'}
              onPress={
                hasDemo ? () => router.replace('/(tabs)/inbox') : () => void connectDemo()
              }
              loading={busy}
              disabled={busy}
              testID="connect-demo"
            />
          </View>
        </Card>

        <SectionTitle title="Gmail (OAuth 2.0)" />
        <Card style={styles.card}>
          <AppText variant="body" weight="medium">
            Connexion Google
          </AppText>
          <AppText variant="caption" color="textSecondary">
            {GMAIL_CLIENT_ID.length > 0
              ? 'Autorise MailYo à lire et envoyer depuis votre adresse Gmail.'
              : 'Aucun identifiant client Google n’est configuré dans ce build (expo.extra.gmailClientId).'}
          </AppText>
          <View style={styles.cardAction}>
            <Button
              label="Connecter Gmail"
              variant="secondary"
              onPress={() => void connectGmail()}
              disabled={busy || GMAIL_CLIENT_ID.length === 0}
              testID="connect-gmail"
            />
          </View>
        </Card>

        {accounts.length > 0 ? (
          <>
            <SectionTitle title="Comptes" />
            <Card style={styles.card}>
              {accounts.map((account) => (
                <View key={account.id} style={styles.accountRow}>
                  <AppText variant="body">{account.emailAddress}</AppText>
                  <AppText variant="caption" color="textSecondary">
                    {account.provider}
                  </AppText>
                </View>
              ))}
            </Card>
          </>
        ) : null}

        {message ? (
          <AppText variant="caption" color="textSecondary" style={styles.message}>
            {message}
          </AppText>
        ) : null}
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
  card: {
    gap: Spacing.xs,
  },
  cardAction: {
    marginTop: Spacing.md,
  },
  accountRow: {
    paddingVertical: Spacing.xs,
  },
  message: {
    marginTop: Spacing.md,
  },
});
