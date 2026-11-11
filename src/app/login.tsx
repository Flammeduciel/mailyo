import { MaterialIcons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { createGmailOAuthAdapter, fetchGmailAddress } from '@/providers';
import { useApp } from '@/state/app-context';
import { useServiceQuery } from '@/state/use-service-query';
import { AppText, Avatar, Button, Header, Screen, Spacing, useAppTheme } from '@/ui';

/** Configured through `expo.extra.gmailClientId`; empty when the build has none. */
const GMAIL_CLIENT_ID = (Constants.expoConfig?.extra?.gmailClientId as string | undefined) ?? '';

const GMAIL_SCOPES = [
  'https://mail.google.com/',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/contacts.readonly',
  'https://www.googleapis.com/auth/contacts.other.readonly',
];

interface Provider {
  id: string;
  name: string;
  subtitle: string;
  icon: string;
  iconColor: string;
  iconBg: string;
  available: boolean;
}

export default function LoginScreen() {
  const colors = useAppTheme();
  const { service, refresh } = useApp();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [messageType, setMessageType] = useState<'info' | 'error'>('info');

  const { data: accounts } = useServiceQuery((mailService) => mailService.listAccounts(), []);

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
      const email = await fetchGmailAddress(tokens.accessToken);
      await service.connectOAuthAccount({ emailAddress: email, tokens });
      setMessageType('info');
      setMessage(`Compte ${email} ajouté — récupération des emails…`);
      await service.refreshContactPhotos(true);
      await refresh();
      router.replace('/discussions');
    } catch (cause: unknown) {
      setMessageType('error');
      setMessage(cause instanceof Error ? cause.message : 'Autorisation refusée');
    } finally {
      setBusy(false);
    }
  }, [service, refresh]);

  const providers: Provider[] = [
    {
      id: 'gmail',
      name: 'Gmail',
      subtitle: 'Google Workspace ou compte personnel',
      icon: 'mail',
      iconColor: '#fff',
      iconBg: '#EA4335',
      available: GMAIL_CLIENT_ID.length > 0,
    },
    {
      id: 'outlook',
      name: 'Outlook / Microsoft 365',
      subtitle: 'Bientôt disponible',
      icon: 'mail-outline',
      iconColor: '#fff',
      iconBg: '#0078D4',
      available: false,
    },
    {
      id: 'yahoo',
      name: 'Yahoo Mail',
      subtitle: 'Bientôt disponible',
      icon: 'mail-outline',
      iconColor: '#fff',
      iconBg: '#6001D2',
      available: false,
    },
    {
      id: 'imap',
      name: 'IMAP générique',
      subtitle: 'Bientôt disponible',
      icon: 'dns',
      iconColor: '#fff',
      iconBg: '#607D8B',
      available: false,
    },
  ];

  return (
    <Screen>
      <Header title="Ajouter un compte" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={styles.content}>
        {/* Intro */}
        <AppText variant="body" color="textSecondary" style={styles.intro}>
          Choisissez votre fournisseur de messagerie pour connecter votre boîte mail.
        </AppText>

        {/* Provider list */}
        <View
          style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
        >
          {providers.map((provider, index) => (
            <View key={provider.id}>
              {index > 0 ? (
                <View style={[styles.divider, { backgroundColor: colors.border }]} />
              ) : null}
              <View style={[styles.providerRow, !provider.available && styles.providerRowDisabled]}>
                {/* Icon */}
                <View style={[styles.providerIcon, { backgroundColor: provider.iconBg }]}>
                  <MaterialIcons
                    name={provider.icon as never}
                    size={22}
                    color={provider.iconColor}
                  />
                </View>

                {/* Text */}
                <View style={styles.providerText}>
                  <AppText
                    variant="body"
                    weight="semibold"
                    style={!provider.available ? { color: colors.textMuted } : undefined}
                  >
                    {provider.name}
                  </AppText>
                  <AppText variant="caption" color="textMuted">
                    {provider.subtitle}
                  </AppText>
                </View>

                {/* Action */}
                {provider.id === 'gmail' ? (
                  <Button
                    label={busy ? 'Connexion…' : 'Connecter'}
                    variant="primary"
                    onPress={() => void connectGmail()}
                    disabled={busy || !provider.available}
                    testID="connect-gmail"
                  />
                ) : (
                  <View style={[styles.badge, { backgroundColor: colors.surfaceAlt }]}>
                    <AppText variant="caption" color="textMuted">
                      Bientôt
                    </AppText>
                  </View>
                )}
              </View>
            </View>
          ))}
        </View>

        {/* Connected accounts */}
        {accounts.length > 0 ? (
          <>
            <AppText
              variant="caption"
              weight="semibold"
              color="textSecondary"
              style={styles.sectionLabel}
            >
              COMPTES CONNECTÉS
            </AppText>
            <View
              style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
            >
              {accounts.map((account, index) => (
                <View key={account.id}>
                  {index > 0 ? (
                    <View style={[styles.divider, { backgroundColor: colors.border }]} />
                  ) : null}
                  <View style={styles.accountRow}>
                    <Avatar
                      name={account.emailAddress}
                      size={36}
                      imageUri={service.getContactPhoto(account.emailAddress)}
                    />
                    <View style={styles.providerText}>
                      <AppText variant="body" weight="medium" numberOfLines={1}>
                        {account.emailAddress}
                      </AppText>
                      <AppText variant="caption" color="textMuted">
                        {account.provider}
                      </AppText>
                    </View>
                    <MaterialIcons name="check-circle" size={20} color={colors.primary} />
                  </View>
                </View>
              ))}
            </View>
          </>
        ) : null}

        {/* Feedback message */}
        {message ? (
          <AppText
            variant="caption"
            color={messageType === 'error' ? 'danger' : 'textSecondary'}
            style={styles.feedback}
          >
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
  intro: {
    marginBottom: Spacing.xs,
  },
  sectionLabel: {
    marginTop: Spacing.sm,
    letterSpacing: 0.5,
  },
  card: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 68,
  },
  providerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
  },
  providerRowDisabled: {
    opacity: 0.6,
  },
  providerIcon: {
    width: 44,
    height: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  providerText: {
    flex: 1,
    gap: 2,
  },
  badge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: 6,
  },
  accountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  feedback: {
    textAlign: 'center',
    marginTop: Spacing.xs,
  },
});
