import { router, useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';

import type { Account, NotificationRule } from '@/domain/models';
import type { AppSettings } from '@/domain/settings';
import { DEFAULT_SETTINGS } from '@/domain/settings';
import { useApp } from '@/state/app-context';
import { useServiceQuery } from '@/state/use-service-query';
import {
  AppText,
  Button,
  Card,
  Chips,
  Header,
  Screen,
  SectionTitle,
  SettingRow,
  Spacing,
  type ChipOption,
} from '@/ui';

interface SettingsData {
  accounts: Account[];
  rules: NotificationRule[];
  settings: AppSettings;
}

const INITIAL: SettingsData = { accounts: [], rules: [], settings: DEFAULT_SETTINGS };

const CONTENT_MODES: ChipOption<AppSettings['contentMode']>[] = [
  { value: 'full', label: 'Complet' },
  { value: 'sender', label: 'Expéditeur seul' },
  { value: 'hidden', label: 'Masqué' },
];

const THEMES: ChipOption<AppSettings['theme']>[] = [
  { value: 'system', label: 'Système' },
  { value: 'light', label: 'Clair' },
  { value: 'dark', label: 'Sombre' },
];

export default function SettingsScreen() {
  const { service, biometricsAvailable } = useApp();

  const { data, reload } = useServiceQuery<SettingsData>(async (mailService) => {
    const [accounts, rules] = await Promise.all([
      mailService.listAccounts(),
      mailService.listRules(),
    ]);
    return { accounts, rules, settings: mailService.getSettings() };
  }, INITIAL);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  const onToggleRule = useCallback(
    (rule: NotificationRule, enabled: boolean) => {
      void (async () => {
        await service.setRuleEnabled(rule.id, enabled);
        await reload();
      })();
    },
    [service, reload],
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

  const confirmRemoveAccount = useCallback(
    (account: Account) => {
      Alert.alert(
        'Retirer le compte',
        `Supprimer ${account.emailAddress} et toutes ses données locales ?`,
        [
          { text: 'Annuler', style: 'cancel' },
          {
            text: 'Retirer',
            style: 'destructive',
            onPress: () => {
              void (async () => {
                await service.deleteAccountData(account.id);
                await reload();
              })();
            },
          },
        ],
      );
    },
    [service, reload],
  );

  return (
    <Screen>
      <Header title="Paramètres" />
      <ScrollView contentContainerStyle={styles.content}>
        <SectionTitle title="Comptes" />
        <Card style={styles.card}>
          {data.accounts.map((account) => (
            <SettingRow
              key={account.id}
              label={account.emailAddress}
              description={`${account.provider} · appuyer pour retirer`}
              icon="envelope"
              onPress={() => confirmRemoveAccount(account)}
            />
          ))}
          <View style={styles.cardAction}>
            <Button
              label="Ajouter un compte"
              variant="secondary"
              onPress={() => router.push('/login')}
            />
          </View>
        </Card>

        <SectionTitle title="Notifications" />
        <Card style={styles.card}>
          <View style={styles.field}>
            <AppText variant="body" weight="medium">
              Contenu des notifications
            </AppText>
            <Chips
              options={CONTENT_MODES}
              value={data.settings.contentMode}
              onChange={(contentMode) => updateSettings({ contentMode })}
            />
          </View>
          <SettingRow
            label="Tester la notification"
            description="Vérifie le son et la vibration"
            icon="bell"
            onPress={() => {
              void service.presentTestNotification('default');
            }}
          />
        </Card>

        <SectionTitle title="Apparence" />
        <Card style={styles.card}>
          <View style={styles.field}>
            <AppText variant="body" weight="medium">
              Thème
            </AppText>
            <Chips
              options={THEMES}
              value={data.settings.theme}
              onChange={(theme) => updateSettings({ theme })}
            />
          </View>
        </Card>

        <SectionTitle title="Sécurité" />
        <Card style={styles.card}>
          <SettingRow
            label="Verrouillage biométrique"
            description={
              biometricsAvailable
                ? "Demander Face ID / empreinte à l'ouverture"
                : 'Indisponible : aucune biométrie configurée sur cet appareil'
            }
            value={data.settings.biometricLock}
            onValueChange={
              biometricsAvailable
                ? (enabled) => updateSettings({ biometricLock: enabled })
                : undefined
            }
          />
        </Card>

        <SectionTitle title="Règles de notification" />
        <Card style={styles.card}>
          {data.rules.length === 0 ? (
            <AppText variant="caption" color="textSecondary" style={styles.empty}>
              Aucune règle. Créez-en une pour choisir une sonnerie par expéditeur.
            </AppText>
          ) : (
            data.rules.map((rule) => (
              <SettingRow
                key={rule.id}
                label={describeRule(rule)}
                description={rule.action === 'notify' ? 'Notifier' : 'Silencieux'}
                value={rule.enabled}
                onValueChange={(enabled) => onToggleRule(rule, enabled)}
                onPress={() => router.push(`/rules/edit?id=${rule.id}`)}
                icon="bell.badge"
              />
            ))
          )}
          <View style={styles.cardAction}>
            <Button
              label="Nouvelle règle"
              variant="secondary"
              onPress={() => router.push('/rules/edit')}
              testID="settings-new-rule"
            />
          </View>
        </Card>

        <SectionTitle title="Fiabilité" />
        <Card style={styles.card}>
          <SettingRow
            label="Réception en arrière-plan"
            description="Autoriser MailYo à rester actif pour recevoir les emails"
            icon="bolt"
            onPress={() => router.push('/onboarding')}
          />
        </Card>

        <SectionTitle title="À propos" />
        <Card style={styles.card}>
          <SettingRow
            label="MailYo"
            description="Messagerie email instantanée"
            icon="info.circle"
          />
          <SettingRow label="Version" description="0.1.0 (MVP)" />
          <AppText variant="caption" color="textSecondary" style={styles.privacy}>
            Aucune donnée n’est envoyée à un serveur intermédiaire. Vos emails restent chez votre
            fournisseur.
          </AppText>
        </Card>
      </ScrollView>
    </Screen>
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
  content: {
    paddingBottom: Spacing.xxl,
  },
  card: {
    marginHorizontal: Spacing.lg,
    padding: 0,
    overflow: 'hidden',
  },
  cardAction: {
    padding: Spacing.md,
  },
  field: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    gap: Spacing.sm,
  },
  empty: {
    padding: Spacing.lg,
  },
  privacy: {
    padding: Spacing.lg,
  },
});
