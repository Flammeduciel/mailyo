import { MaterialIcons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { createGmailOAuthAdapter, fetchGmailAddress } from '@/providers';
import { COMING_SOON_SERVICES, MAIL_SERVICES } from '@/providers/imap/presets';
import { useApp } from '@/state/app-context';
import { useServiceQuery } from '@/state/use-service-query';
import { AppText, Avatar, Button, Header, Screen, ServiceLogo, Spacing, useAppTheme } from '@/ui';

/** Configured through `expo.extra.gmailClientId`; empty when the build has none. */
const GMAIL_CLIENT_ID = (Constants.expoConfig?.extra?.gmailClientId as string | undefined) ?? '';

const GMAIL_SCOPES = [
  'https://mail.google.com/',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/contacts.readonly',
  'https://www.googleapis.com/auth/contacts.other.readonly',
];

export default function LoginScreen() {
  const colors = useAppTheme();
  const { service, refresh, invalidate } = useApp();
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
      // Back to the inbox right away: the progress ring there shows the first
      // sync, and conversations appear as they are stored.
      router.replace('/discussions');
      void refresh();
      void service.refreshContactPhotos(true).then(() => invalidate());
    } catch (cause: unknown) {
      setMessageType('error');
      setMessage(cause instanceof Error ? cause.message : 'Autorisation refusée');
    } finally {
      setBusy(false);
    }
  }, [service, refresh, invalidate]);

  const imapServices = [
    ...MAIL_SERVICES,
    { id: 'other', name: 'Autre adresse', color: '#607D8B', monogram: '@' },
  ];

  return (
    <Screen>
      <Header title="Ajouter un compte" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={styles.content}>
        <AppText variant="body" color="textSecondary" style={styles.intro}>
          Choisissez votre messagerie. Vos identifiants restent sur ce téléphone, dans son stockage
          sécurisé.
        </AppText>

        {/* Google (OAuth) */}
        <AppText
          variant="caption"
          weight="semibold"
          color="textSecondary"
          style={styles.sectionLabel}
        >
          GOOGLE
        </AppText>
        <View
          style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
        >
          <View style={[styles.providerRow, !GMAIL_CLIENT_ID && styles.providerRowDisabled]}>
            <ServiceLogo id="gmail" color="#EA4335" monogram="G" />
            <View style={styles.providerText}>
              <AppText variant="body" weight="semibold">
                Gmail
              </AppText>
              <AppText variant="caption" color="textMuted">
                Google Workspace ou compte personnel
              </AppText>
            </View>
            <Button
              label={busy ? 'Connexion…' : 'Connecter'}
              variant="primary"
              onPress={() => void connectGmail()}
              disabled={busy || !GMAIL_CLIENT_ID}
              testID="connect-gmail"
            />
          </View>
        </View>

        {/* IMAP services, with their logos */}
        <AppText
          variant="caption"
          weight="semibold"
          color="textSecondary"
          style={styles.sectionLabel}
        >
          AUTRES MESSAGERIES
        </AppText>
        <View style={styles.grid}>
          {imapServices.map((service) => (
            <Pressable
              key={service.id}
              onPress={() =>
                router.push({ pathname: '/imap-login', params: { service: service.id } })
              }
              style={({ pressed }) => [
                styles.tile,
                {
                  backgroundColor: pressed ? colors.surfaceAlt : colors.surface,
                  borderColor: colors.border,
                },
              ]}
              accessibilityRole="button"
              accessibilityLabel={`Connecter ${service.name}`}
              testID={`connect-${service.id}`}
            >
              <ServiceLogo
                id={service.id}
                color={service.color}
                monogram={service.monogram}
                size={40}
                wide
              />
              <AppText
                variant="caption"
                weight="semibold"
                numberOfLines={1}
                style={styles.tileLabel}
              >
                {service.name}
              </AppText>
            </Pressable>
          ))}
        </View>

        {/* Microsoft: coming later (Microsoft Graph) */}
        <AppText
          variant="caption"
          weight="semibold"
          color="textSecondary"
          style={styles.sectionLabel}
        >
          BIENTÔT DISPONIBLE
        </AppText>
        <View
          style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
        >
          {COMING_SOON_SERVICES.map((service, index) => (
            <View key={service.id}>
              {index > 0 ? (
                <View style={[styles.divider, { backgroundColor: colors.border }]} />
              ) : null}
              <View style={styles.providerRow}>
                <ServiceLogo
                  id={service.id}
                  color={service.color}
                  monogram={service.monogram}
                  muted
                />
                <View style={styles.providerText}>
                  <AppText variant="body" weight="semibold" style={{ color: colors.textMuted }}>
                    {service.name}
                  </AppText>
                  <AppText variant="caption" color="textMuted">
                    Connexion Microsoft en préparation
                  </AppText>
                </View>
                <View style={[styles.badge, { backgroundColor: colors.primaryContainer }]}>
                  <AppText
                    variant="caption"
                    weight="semibold"
                    style={{ color: colors.onPrimaryContainer }}
                  >
                    Bientôt
                  </AppText>
                </View>
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
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  tile: {
    width: '31%',
    flexGrow: 1,
    alignItems: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xs,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  tileLabel: {
    textAlign: 'center',
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
