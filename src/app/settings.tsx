import Constants from 'expo-constants';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { Account, NotificationRule } from '@/domain/models';
import { describePermissions, type PermissionTag } from '@/domain/permissions';
import type { AppSettings } from '@/domain/settings';
import { DEFAULT_SETTINGS } from '@/domain/settings';
import { realtimeTransports } from '@/realtime/use-realtime';
import type { RealtimeStatus } from '@/realtime/transport';
import { useApp } from '@/state/app-context';
import { useServiceQuery } from '@/state/use-service-query';
import { formatFileSize } from '@/domain/attachments';
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

const AUTO_PREVIEW: { value: string; label: string }[] = [
  { value: '0', label: 'Jamais' },
  { value: '3', label: 'Jusqu’à 3 Mo' },
  { value: '10', label: 'Jusqu’à 10 Mo' },
];

const CELLULAR_CONFIRM: { value: string; label: string }[] = [
  { value: '0', label: 'Ne jamais demander' },
  { value: '5', label: 'Au-delà de 5 Mo' },
  { value: '10', label: 'Au-delà de 10 Mo' },
];

function describeRealtime(enabled: boolean, status: RealtimeStatus | null): string {
  if (!enabled) {
    return 'Désactivées · les mails sont relevés environ toutes les 15 min, quand Android le permet';
  }
  if (status?.running && status.accounts.length > 0) {
    const count = status.accounts.length;
    return `Connexion permanente active · ${count} compte${count > 1 ? 's' : ''} surveillé${
      count > 1 ? 's' : ''
    } · le mail sonne dès son arrivée`;
  }
  return 'Le mail sonne dès son arrivée (connexion permanente, petite notification fixe)';
}

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
  const { service, biometricsAvailable, setTheme, theme, invalidate, applyRealtime } = useApp();
  const { idle: idleTransport } = realtimeTransports();

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

  const [cacheBytes, setCacheBytes] = useState(0);
  useFocusEffect(
    useCallback(() => {
      setCacheBytes(service.attachmentCacheSize());
    }, [service]),
  );

  const [realtime, setRealtime] = useState<RealtimeStatus | null>(null);
  const refreshRealtimeStatus = useCallback(() => {
    if (!idleTransport.isAvailable()) return;
    idleTransport
      .status()
      .then(setRealtime)
      .catch(() => setRealtime(null));
  }, [idleTransport]);
  useFocusEffect(refreshRealtimeStatus);

  const updateSettings = useCallback(
    (patch: Partial<AppSettings>) => {
      void (async () => {
        await service.updateSettings(patch);
        await reload();
        // Notification preferences and the mode are applied by the native service too.
        await applyRealtime();
        setTimeout(refreshRealtimeStatus, 800);
      })();
    },
    [service, reload, applyRealtime, refreshRealtimeStatus],
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
          label="Notifications instantanées"
          description={describeRealtime(data.settings.realtimeMode === 'idle', realtime)}
          value={data.settings.realtimeMode === 'idle'}
          onValueChange={(enabled) => updateSettings({ realtimeMode: enabled ? 'idle' : 'off' })}
          testID="settings-realtime"
        />
        {data.settings.realtimeMode === 'idle' && realtime && !realtime.batteryUnrestricted ? (
          <SettingRow
            icon="battery-alert"
            label="Ne pas restreindre la batterie"
            description="Recommandé : sans cela, certains téléphones coupent la connexion et les mails arrivent en retard"
            onPress={() => idleTransport.openBatterySettings()}
            testID="settings-battery"
          />
        ) : null}
        <SettingRow
          icon="cloud-sync"
          label="Serveur relais (push Gmail / Microsoft)"
          description="Bientôt disponible · notifications sans connexion permanente, plus économe en batterie"
          testID="settings-relay"
        />
        <SettingRow
          icon="tune"
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

        <Section title="Newsletters et publicités" />
        <SettingRow
          icon="unsubscribe"
          label="Abonnements"
          description="Voir les newsletters reçues et s’en désabonner en un appui"
          onPress={() => router.push('/subscriptions')}
          testID="settings-subscriptions"
        />
        <SettingRow
          icon="report"
          label="Spam"
          description="Les mails classés spam par Gmail portent un badge rouge ; filtre « Spam » en haut de la liste"
        />

        <Section title="Pièces jointes" />
        <SettingRow
          icon="image"
          label="Aperçu automatique des images"
          description={labelOf(AUTO_PREVIEW, String(data.settings.autoPreviewMaxMb))}
          onPress={() =>
            choose('Aperçu automatique des images', AUTO_PREVIEW, (value) =>
              updateSettings({ autoPreviewMaxMb: Number(value) }),
            )
          }
          testID="settings-auto-preview"
        />
        <SettingRow
          icon="signal-cellular-alt"
          label="Confirmer en données mobiles"
          description={labelOf(CELLULAR_CONFIRM, String(data.settings.cellularConfirmMb))}
          onPress={() =>
            choose('Confirmer en données mobiles', CELLULAR_CONFIRM, (value) =>
              updateSettings({ cellularConfirmMb: Number(value) }),
            )
          }
          testID="settings-cellular"
        />
        <SettingRow
          icon="offline-pin"
          label="Favoris disponibles hors ligne"
          description="Télécharge les pièces jointes des mails marqués d’une étoile"
          value={data.settings.offlineStarredAttachments}
          onValueChange={(enabled) => {
            updateSettings({ offlineStarredAttachments: enabled });
            if (enabled) void service.downloadStarredAttachments();
          }}
          testID="settings-offline"
        />
        <SettingRow
          icon="cleaning-services"
          label="Vider le cache des pièces jointes"
          description={`${formatFileSize(cacheBytes)} utilisés sur ce téléphone`}
          onPress={() =>
            Alert.alert('Vider le cache ?', 'Les fichiers seront retéléchargés si besoin.', [
              { text: 'Annuler', style: 'cancel' },
              {
                text: 'Vider',
                style: 'destructive',
                onPress: () => void service.clearAttachmentCache().then(() => setCacheBytes(0)),
              },
            ])
          }
          testID="settings-clear-cache"
        />

        <Section title="Confidentialité" />
        <SettingRow
          icon="hide-image"
          label="Bloquer les images distantes"
          description="Évite les pixels espions ; « Afficher les images » dans chaque mail"
          value={data.settings.blockRemoteImages}
          onValueChange={(enabled) => updateSettings({ blockRemoteImages: enabled })}
          testID="settings-block-images"
        />
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
