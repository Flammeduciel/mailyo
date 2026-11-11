import Constants from 'expo-constants';
import { router, useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { Account, NotificationRule } from '@/domain/models';
import { describePermissions, type PermissionTag } from '@/domain/permissions';
import type { AppSettings } from '@/domain/settings';
import { DEFAULT_SETTINGS } from '@/domain/settings';
import { useApp } from '@/state/app-context';
import { useServiceQuery } from '@/state/use-service-query';
import { AccountRow, AppBar, AppText, Avatar, SettingRow, Spacing, useAppTheme } from '@/ui';

interface SettingsData {
  accounts: Account[];
  permissions: Record<string, PermissionTag[]>;
  rules: NotificationRule[];
  settings: AppSettings;
}

const INITIAL: SettingsData = {
  accounts: [],
  permissions: {},
  rules: [],
  settings: DEFAULT_SETTINGS,
};

const CONTENT_MODES: { value: AppSettings['contentMode']; label: string }[] = [
  { value: 'full', label: 'Complet' },
  { value: 'sender', label: 'Expéditeur seul' },
  { value: 'hidden', label: 'Masqué' },
];

const THEMES: { value: AppSettings['theme']; label: string }[] = [
  { value: 'system', label: 'Par défaut du système' },
  { value: 'light', label: 'Clair' },
  { value: 'dark', label: 'Sombre' },
];

function labelOf<T extends string>(options: { value: T; label: string }[], value: T): string {
  return options.find((option) => option.value === value)?.label ?? value;
}

/** Choice dialog (Android supports up to three buttons, enough for these settings). */
function choose<T extends string>(
  title: string,
  options: { value: T; label: string }[],
  onPick: (value: T) => void,
) {
  Alert.alert(
    title,
    undefined,
    options.map((option) => ({ text: option.label, onPress: () => onPick(option.value) })),
    { cancelable: true },
  );
}

export default function SettingsScreen() {
  const colors = useAppTheme();
  const { service, biometricsAvailable, setTheme, theme, invalidate } = useApp();

  const { data, reload } = useServiceQuery<SettingsData>(async (mailService) => {
    const [accounts, rules] = await Promise.all([
      mailService.listAccounts(),
      mailService.listRules(),
    ]);
    const permissions: Record<string, PermissionTag[]> = {};
    for (const account of accounts) {
      permissions[account.id] =
        account.authType === 'oauth'
          ? describePermissions(await mailService.getAccountScope(account.id))
          : [];
    }
    return { accounts, permissions, rules, settings: mailService.getSettings() };
  }, INITIAL);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  const updateSettings = useCallback(
    (patch: Partial<AppSettings>) => {
      void (async () => {
        await service.updateSettings(patch);
        await reload();
      })();
    },
    [service, reload],
  );

  const confirmSignOut = useCallback(
    (account: Account) => {
      Alert.alert(
        'Se déconnecter',
        `Déconnecter ${account.emailAddress} ? L’accès de MailYo à ce compte est révoqué et ses mails sont effacés de ce téléphone (ils restent dans Gmail).`,
        [
          { text: 'Annuler', style: 'cancel' },
          {
            text: 'Se déconnecter',
            style: 'destructive',
            onPress: () => {
              void (async () => {
                await service.signOutAccount(account.id);
                invalidate();
                await reload();
              })();
            },
          },
        ],
      );
    },
    [service, reload, invalidate],
  );

  const primary = data.accounts[0];

  return (
    <SafeAreaView
      edges={['top', 'bottom']}
      style={[styles.screen, { backgroundColor: colors.background }]}
    >
      <AppBar title="Paramètres" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={styles.content}>
        {/* Profile card: the main account, like the profile row of a messaging app. */}
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/login')}
          style={({ pressed }) => [
            styles.profile,
            pressed && { backgroundColor: colors.surfaceAlt },
          ]}
          testID="settings-profile"
        >
          <Avatar
            name={primary?.displayName || primary?.emailAddress || 'MailYo'}
            size={64}
            imageUri={service.getContactPhoto(primary?.emailAddress)}
          />
          <View style={styles.profileText}>
            <AppText weight="semibold" style={styles.profileName} numberOfLines={1}>
              {primary ? primary.displayName || primary.emailAddress : 'Aucun compte'}
            </AppText>
            <AppText variant="caption" color="textSecondary" numberOfLines={1}>
              {primary
                ? data.accounts.length > 1
                  ? `${primary.emailAddress} · +${data.accounts.length - 1} compte(s)`
                  : primary.emailAddress
                : 'Touchez pour ajouter un compte'}
            </AppText>
          </View>
        </Pressable>
        <View style={[styles.divider, { backgroundColor: colors.border }]} />

        <Section title="Comptes" />
        {data.accounts.map((account) => (
          <AccountRow
            key={account.id}
            emailAddress={account.emailAddress}
            subtitle={`${account.provider === 'gmail' ? 'Gmail' : account.provider} · ${
              account.syncStatus === 'error' ? 'erreur de synchronisation' : 'synchronisé'
            }`}
            photoUri={service.getContactPhoto(account.emailAddress)}
            permissions={data.permissions[account.id] ?? []}
            onSignOut={() => confirmSignOut(account)}
            testID={`settings-account-${account.id}`}
          />
        ))}
        <SettingRow
          icon="person-add-alt"
          label="Ajouter un compte"
          description="Gmail, Outlook, Yahoo ou IMAP"
          onPress={() => router.push('/login')}
          testID="settings-add-account"
        />

        <Section title="Discussions" />
        <SettingRow
          icon="brightness-medium"
          label="Thème"
          description={labelOf(THEMES, theme)}
          onPress={() => choose('Choisir le thème', THEMES, (value) => void setTheme(value))}
          testID="settings-theme"
        />
        <SettingRow
          icon="archive"
          label="Discussions archivées"
          description="Conversations rangées hors des onglets"
          onPress={() => router.push('/archived')}
        />

        <Section title="Notifications" />
        <SettingRow
          icon="notifications-none"
          label="Contenu des notifications"
          description={labelOf(CONTENT_MODES, data.settings.contentMode)}
          onPress={() =>
            choose('Contenu des notifications', CONTENT_MODES, (contentMode) =>
              updateSettings({ contentMode }),
            )
          }
          testID="settings-content-mode"
        />
        <SettingRow
          icon="volume-up"
          label="Tester la notification"
          description="Vérifie le son et la vibration"
          onPress={() => void service.presentTestNotification('default')}
        />
        <SettingRow
          icon="bolt"
          label="Réception en arrière-plan"
          description="Autoriser MailYo à rester actif pour recevoir les emails"
          onPress={() => router.push('/onboarding')}
        />

        <Section title="Sonneries par expéditeur" />
        {data.rules.map((rule) => (
          <SettingRow
            key={rule.id}
            icon={rule.action === 'notify' ? 'music-note' : 'notifications-off'}
            label={describeRule(rule)}
            description={
              rule.action === 'notify' ? 'Notifier · toucher pour modifier' : 'Silencieux'
            }
            value={rule.enabled}
            onValueChange={(enabled) =>
              void (async () => {
                await service.setRuleEnabled(rule.id, enabled);
                await reload();
              })()
            }
            onPress={() => router.push(`/rules/edit?id=${rule.id}`)}
          />
        ))}
        <SettingRow
          icon="add"
          label="Nouvelle règle"
          description="Choisir une sonnerie pour un expéditeur ou un domaine"
          onPress={() => router.push('/rules/edit')}
          testID="settings-new-rule"
        />

        <Section title="Confidentialité" />
        <SettingRow
          icon="fingerprint"
          label="Verrouillage biométrique"
          description={
            biometricsAvailable
              ? "Demander l'empreinte ou le visage à l'ouverture"
              : 'Indisponible : aucune biométrie configurée sur cet appareil'
          }
          value={data.settings.biometricLock}
          onValueChange={
            biometricsAvailable
              ? (enabled) => updateSettings({ biometricLock: enabled })
              : undefined
          }
        />

        <Section title="Aide" />
        <SettingRow
          icon="info-outline"
          label="À propos de MailYo"
          description={`Version ${Constants.expoConfig?.version ?? '—'} · vos emails restent chez votre fournisseur, sans serveur intermédiaire`}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({ title }: { title: string }) {
  return (
    <AppText variant="caption" weight="semibold" color="textSecondary" style={styles.section}>
      {title}
    </AppText>
  );
}

function describeRule(rule: NotificationRule): string {
  const target = rule.matchValue.length > 0 ? rule.matchValue : 'Tous les expéditeurs';
  switch (rule.matchType) {
    case 'sender':
      return `Expéditeur : ${target}`;
    case 'domain':
      return `Domaine : ${target}`;
    case 'subject':
      return `Objet contient : ${target}`;
    case 'vip':
      return `VIP : ${target}`;
    default:
      return target;
  }
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  content: {
    paddingBottom: Spacing.xxl,
  },
  profile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.lg,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.lg,
  },
  profileText: {
    flex: 1,
    gap: 2,
  },
  profileName: {
    fontSize: 20,
    lineHeight: 26,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
  },
  section: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xl,
    paddingBottom: Spacing.sm,
  },
});
