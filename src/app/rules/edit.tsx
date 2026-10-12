import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { createId } from '@/domain/ids';
import type { NotificationRule, RuleAction, RuleMatchType, VibrationMode } from '@/domain/models';
import { BUILT_IN_SOUNDS } from '@/notifications';
import { useApp } from '@/state/app-context';
import {
  AppText,
  Button,
  Chips,
  Header,
  Screen,
  SectionTitle,
  Spacing,
  TextField,
  type ChipOption,
} from '@/ui';

const MATCH_TYPES: ChipOption<RuleMatchType>[] = [
  { value: 'sender', label: 'Expéditeur' },
  { value: 'domain', label: 'Domaine' },
  { value: 'subject', label: 'Objet' },
  { value: 'all', label: 'Tous' },
];

const ACTIONS: ChipOption<RuleAction>[] = [
  { value: 'notify', label: 'Notifier' },
  { value: 'silent', label: 'Silencieux' },
];

const VIBRATIONS: ChipOption<VibrationMode>[] = [
  { value: 'default', label: 'Normale' },
  { value: 'short', label: 'Courte' },
  { value: 'long', label: 'Longue' },
  { value: 'none', label: 'Aucune' },
];

const PLACEHOLDERS: Record<RuleMatchType, string> = {
  sender: 'nom@exemple.com',
  domain: 'exemple.com',
  subject: 'mots-clés de l’objet',
  vip: '',
  all: '',
};

function createDraft(): NotificationRule {
  return {
    id: createId('rule'),
    accountId: null,
    matchType: 'sender',
    matchValue: '',
    action: 'notify',
    soundId: 'default',
    vibrationMode: 'default',
    enabled: true,
    createdAt: 0,
  };
}

export default function RuleEditScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { service, invalidate } = useApp();
  const [draft, setDraft] = useState<NotificationRule | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!id) {
        if (!cancelled) {
          setDraft(createDraft());
        }
        return;
      }
      const rules = await service.listRules();
      const existing = rules.find((rule) => rule.id === id);
      if (!cancelled) {
        setDraft(existing ?? createDraft());
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, service]);

  const update = useCallback((patch: Partial<NotificationRule>) => {
    setDraft((previous) => (previous ? { ...previous, ...patch } : previous));
  }, []);

  const onSave = useCallback(async () => {
    if (!draft) {
      return;
    }
    await service.saveRule({ ...draft, createdAt: draft.createdAt || Date.now() });
    invalidate();
    router.back();
  }, [draft, service, invalidate]);

  const onDelete = useCallback(async () => {
    if (!draft) {
      return;
    }
    await service.deleteRule(draft.id);
    invalidate();
    router.back();
  }, [draft, service, invalidate]);

  if (!draft) {
    return (
      <Screen>
        <Header title="Règle" onBack={() => router.back()} />
      </Screen>
    );
  }

  const isEditing = id !== undefined;

  return (
    <Screen>
      <Header title={isEditing ? 'Modifier la règle' : 'Nouvelle règle'} onBack={() => router.back()} />
      <ScrollView contentContainerStyle={styles.content}>
        <SectionTitle title="Déclencheur" />
        <Chips
          options={MATCH_TYPES}
          value={draft.matchType}
          onChange={(matchType) => update({ matchType })}
        />
        {draft.matchType !== 'all' ? (
          <TextField
            label="Valeur"
            value={draft.matchValue}
            onChangeText={(matchValue) => update({ matchValue })}
            placeholder={PLACEHOLDERS[draft.matchType]}
            autoCapitalize="none"
            testID="rule-value"
          />
        ) : (
          <AppText variant="caption" color="textSecondary">
            La règle s’applique à tous les messages.
          </AppText>
        )}

        <SectionTitle title="Action" />
        <Chips options={ACTIONS} value={draft.action} onChange={(action) => update({ action })} />

        {draft.action === 'notify' ? (
          <>
            <SectionTitle title="Sonnerie" />
            <Chips
              options={BUILT_IN_SOUNDS.map((sound) => ({ value: sound.id, label: sound.name }))}
              value={draft.soundId ?? 'default'}
              onChange={(soundId) => update({ soundId })}
            />
            <Button
              label="Écouter"
              variant="secondary"
              onPress={() => service.presentTestNotification(draft.soundId)}
            />
            <SectionTitle title="Vibration" />
            <Chips
              options={VIBRATIONS}
              value={draft.vibrationMode}
              onChange={(vibrationMode) => update({ vibrationMode })}
            />
          </>
        ) : (
          <AppText variant="caption" color="textSecondary">
            Les messages correspondants n’afficheront aucune notification.
          </AppText>
        )}

        <View style={styles.actions}>
          <Button label="Enregistrer" onPress={onSave} fullWidth testID="rule-save" />
          {isEditing ? (
            <Button label="Supprimer" variant="danger" onPress={onDelete} fullWidth testID="rule-delete" />
          ) : null}
        </View>
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
  actions: {
    marginTop: Spacing.lg,
    gap: Spacing.md,
  },
});
