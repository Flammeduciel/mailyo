import { MaterialIcons } from '@expo/vector-icons';
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
import {
  AccountRow,
  AppBar,
  AppText,
  Avatar,
  Radius,
  SettingRow,
  SettingsGroup,
  Spacing,
  useAppTheme,
} from '@/ui';

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
  { value: 'system', label: 'Système' },
  { value: 'light', label: 'Clair' },
  { value: 'dark', label: 'Sombre' },
];

const AUTO_PREVIEW: { value: string; label: string; short: string }[] = [
  { value: '0', label: 'Jamais', short: 'Jamais' },
  { value: '3', label: 'Jusqu’à 3 Mo', short: '≤ 3 Mo' },
  { value: '10', label: 'Jusqu’à 10 Mo', short: '≤ 10 Mo' },
];

const CELLULAR_CONFIRM: { value: string; label: string; short: string }[] = [
  { value: '0', label: 'Ne jamais demander', short: 'Jamais' },
  { value: '5', label: 'Au-delà de 5 Mo', short: '> 5 Mo' },
  { value: '10', label: 'Au-delà de 10 Mo', short: '> 10 Mo' },
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

function shortOf(options: { value: string; short: string }[], value: string): string {
  return options.find((option) => option.value === value)?.short ?? value;
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
      style={[styles.screen, { backgroundColor: colors.groupedBackground }]}
    >
      <AppBar
        title="Paramètres"
        onBack={() => router.back()}
        backgroundColor={colors.groupedBackground}
      />
      <ScrollView contentContainerStyle={styles.content}>
        {/* Profile card: the main account. */}
        <View style={styles.profileWrap}>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/login')}
            style={({ pressed }) => [
              styles.profile,
              {
                backgroundColor: pressed ? colors.surfaceAlt : colors.card,
                borderColor: colors.separator,
              },
            ]}
            testID="settings-profile"
          >
            <Avatar
              name={primary?.displayName || primary?.emailAddress || 'MailYo'}
              size={56}
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
            <MaterialIcons name="chevron-right" size={22} color={colors.textMuted} />
          </Pressable>
        </View>

        <SettingsGroup title="Comptes">
          {data.accounts.map((account) => (
            <AccountRow
              key={account.id}
              emailAddress={account.emailAddress}
              subtitle={`${providerLabel(account.provider)} · ${
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
            tone="indigo"
            label="Ajouter un compte"
            description="Gmail, Yahoo, Orange, iCloud ou IMAP"
            onPress={() => router.push('/login')}
            testID="settings-add-account"
          />
        </SettingsGroup>

        <SettingsGroup title="Affichage">
          <SettingRow
            icon="contrast"
            tone="violet"
            label="Thème"
            detail={labelOf(THEMES, theme)}
            onPress={() => choose('Choisir le thème', THEMES, (value) => void setTheme(value))}
            testID="settings-theme"
          />
          <SettingRow
            icon="inventory-2"
            tone="gray"
            label="Discussions archivées"
            onPress={() => router.push('/archived')}
          />
          <SettingRow
            icon="delete-outline"
            tone="rose"
            label="Corbeille"
            description="Restaurer un mail supprimé"
            onPress={() => router.push('/trash')}
          />
        </SettingsGroup>

        <SettingsGroup
          title="Notifications"
          footer={describeRealtime(data.settings.realtimeMode === 'idle', realtime)}
        >
          <SettingRow
            icon="bolt"
            tone="orange"
            label="Notifications instantanées"
            value={data.settings.realtimeMode === 'idle'}
            onValueChange={(enabled) => updateSettings({ realtimeMode: enabled ? 'idle' : 'off' })}
            testID="settings-realtime"
          />
          {data.settings.realtimeMode === 'idle' && realtime && !realtime.batteryUnrestricted ? (
            <SettingRow
              icon="battery-alert"
              tone="rose"
              label="Ne pas restreindre la batterie"
              description="Recommandé : sinon certains téléphones coupent la connexion"
              onPress={() => idleTransport.openBatterySettings()}
              testID="settings-battery"
            />
          ) : null}
          <SettingRow
            icon="notifications-none"
            tone="indigo"
            label="Contenu affiché"
            detail={labelOf(CONTENT_MODES, data.settings.contentMode)}
            onPress={() =>
              choose('Contenu des notifications', CONTENT_MODES, (contentMode) =>
                updateSettings({ contentMode }),
              )
            }
            testID="settings-content-mode"
          />
          <SettingRow
            icon="volume-up"
            tone="blue"
            label="Tester la notification"
            onPress={() => void service.presentTestNotification('default')}
          />
          <SettingRow
            icon="tune"
            tone="gray"
            label="Réception en arrière-plan"
            onPress={() => router.push('/onboarding')}
          />
          <SettingRow
            icon="cloud-sync"
            tone="blue"
            label="Serveur relais"
            description="Push Gmail et Microsoft sans connexion permanente"
            detail="Bientôt"
            disabled
            testID="settings-relay"
          />
        </SettingsGroup>

        <SettingsGroup title="Sonneries par expéditeur">
          {data.rules.map((rule) => (
            <SettingRow
              key={rule.id}
              icon={rule.action === 'notify' ? 'music-note' : 'notifications-off'}
              tone={rule.action === 'notify' ? 'green' : 'gray'}
              label={describeRule(rule)}
              description={rule.action === 'notify' ? 'Sonnerie dédiée' : 'Silencieux'}
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
            tone="green"
            label="Nouvelle règle"
            description="Une sonnerie pour un expéditeur ou un domaine"
            onPress={() => router.push('/rules/edit')}
            testID="settings-new-rule"
          />
        </SettingsGroup>

        <SettingsGroup
          title="Newsletters et spam"
          footer="Les mails classés spam par votre messagerie portent un badge et se retrouvent sous le filtre « Spam »."
        >
          <SettingRow
            icon="unsubscribe"
            tone="olive"
            label="Abonnements"
            description="Se désabonner en un appui"
            onPress={() => router.push('/subscriptions')}
            testID="settings-subscriptions"
          />
        </SettingsGroup>

        <SettingsGroup title="Pièces jointes et stockage">
          <SettingRow
            icon="image"
            tone="blue"
            label="Aperçu des images"
            detail={shortOf(AUTO_PREVIEW, String(data.settings.autoPreviewMaxMb))}
            onPress={() =>
              choose('Aperçu automatique des images', AUTO_PREVIEW, (value) =>
                updateSettings({ autoPreviewMaxMb: Number(value) }),
              )
            }
            testID="settings-auto-preview"
          />
          <SettingRow
            icon="signal-cellular-alt"
            tone="green"
            label="Alerte données mobiles"
            detail={shortOf(CELLULAR_CONFIRM, String(data.settings.cellularConfirmMb))}
            onPress={() =>
              choose('Confirmer en données mobiles', CELLULAR_CONFIRM, (value) =>
                updateSettings({ cellularConfirmMb: Number(value) }),
              )
            }
            testID="settings-cellular"
          />
          <SettingRow
            icon="offline-pin"
            tone="indigo"
            label="Favoris hors ligne"
            description="Télécharge les pièces jointes des mails étoilés"
            value={data.settings.offlineStarredAttachments}
            onValueChange={(enabled) => {
              updateSettings({ offlineStarredAttachments: enabled });
              if (enabled) void service.downloadStarredAttachments();
            }}
            testID="settings-offline"
          />
          <SettingRow
            icon="cleaning-services"
            tone="orange"
            label="Vider le cache"
            detail={formatFileSize(cacheBytes)}
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
        </SettingsGroup>

        <SettingsGroup title="Confidentialité et sécurité">
          <SettingRow
            icon="hide-image"
            tone="violet"
            label="Bloquer les images distantes"
            description="Évite les pixels espions"
            value={data.settings.blockRemoteImages}
            onValueChange={(enabled) => updateSettings({ blockRemoteImages: enabled })}
            testID="settings-block-images"
          />
          <SettingRow
            icon="fingerprint"
            tone="rose"
            label="Verrouillage biométrique"
            description={
              biometricsAvailable
                ? 'Empreinte ou visage à l’ouverture'
                : 'Aucune biométrie configurée sur cet appareil'
            }
            value={data.settings.biometricLock}
            onValueChange={
              biometricsAvailable
                ? (enabled) => updateSettings({ biometricLock: enabled })
                : undefined
            }
          />
        </SettingsGroup>

        <View style={styles.about}>
          <AppText weight="semibold" color="textSecondary">
            MailYo
          </AppText>
          <AppText variant="caption" color="textMuted" style={styles.aboutText}>
            Version {Constants.expoConfig?.version ?? '—'} · Vos mails restent chez votre
            fournisseur, sans serveur intermédiaire.
          </AppText>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function providerLabel(provider: string): string {
  if (provider === 'gmail') return 'Gmail';
  if (provider === 'imap') return 'IMAP';
  return provider.charAt(0).toUpperCase() + provider.slice(1);
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
  profileWrap: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
  },
  profile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md + 2,
    padding: Spacing.lg,
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  profileText: {
    flex: 1,
    gap: 2,
  },
  profileName: {
    fontSize: 18,
    lineHeight: 24,
  },
  about: {
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: Spacing.xxl,
    paddingTop: Spacing.xxl,
  },
  aboutText: {
    textAlign: 'center',
    lineHeight: 18,
  },
});
