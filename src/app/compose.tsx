import { MaterialIcons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { useApp } from '@/state/app-context';
import { useServiceQuery } from '@/state/use-service-query';
import { AppText, Button, Header, Screen, Spacing, TextField, useAppTheme } from '@/ui';

export default function ComposeScreen() {
  const { service, invalidate } = useApp();
  const colors = useAppTheme();
  // Optional prefill, e.g. "Transférer" from a conversation.
  const params = useLocalSearchParams<{ to?: string; subject?: string; body?: string }>();
  const [to, setTo] = useState(params.to ?? '');
  const [ccList, setCcList] = useState<string[]>([]);
  const [subject, setSubject] = useState(params.subject ?? '');
  const [body, setBody] = useState(params.body ?? '');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: accounts } = useServiceQuery((mailService) => mailService.listAccounts(), []);

  const addCc = useCallback(() => setCcList((prev) => [...prev, '']), []);
  const updateCc = useCallback((index: number, value: string) => {
    setCcList((prev) => prev.map((v, i) => (i === index ? value : v)));
  }, []);
  const removeCc = useCallback((index: number) => {
    setCcList((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const cc = ccList.filter(Boolean).join(', ');

  const onSend = useCallback(async () => {
    const account = accounts[0];
    if (!account) {
      setError('Aucun compte configuré.');
      return;
    }
    setSending(true);
    setError(null);
    try {
      const result = await service.send({
        accountId: account.id,
        to,
        cc,
        subject,
        body,
      });
      if (result.status === 'sent') {
        invalidate();
        router.back();
        return;
      }
      if (result.status === 'ambiguous') {
        setError(`Statut d'envoi incertain : vérifiez le dossier « Messages envoyés ».`);
      } else {
        setError(result.error ?? `L'envoi a échoué.`);
      }
    } finally {
      setSending(false);
    }
  }, [accounts, to, cc, subject, body, service, invalidate]);

  const canSend = to.trim().length > 0 && accounts.length > 0 && !sending;

  return (
    <Screen>
      <Header title="Nouveau message" onBack={() => router.back()} />

      <View style={styles.form}>
        {accounts.length > 0 ? (
          <AppText variant="caption" color="textSecondary">
            Depuis : {accounts[0].emailAddress}
          </AppText>
        ) : (
          <AppText variant="caption" color="danger">
            Aucun compte configuré.
          </AppText>
        )}

        {accounts.length === 0 ? (
          <Button
            label="Ajouter un compte"
            variant="secondary"
            onPress={() => router.push('/login')}
          />
        ) : null}

        <TextField
          label="Destinataire"
          value={to}
          onChangeText={setTo}
          placeholder="nom@exemple.com"
          keyboardType="email-address"
          autoCapitalize="none"
          testID="compose-to"
        />

        {/* CC fields */}
        {ccList.map((value, index) => (
          <View key={index} style={styles.ccRow}>
            <View style={styles.ccField}>
              <TextField
                label={`Copie ${ccList.length > 1 ? index + 1 : ''}`.trim()}
                value={value}
                onChangeText={(v) => updateCc(index, v)}
                placeholder="cc@exemple.com"
                keyboardType="email-address"
                autoCapitalize="none"
                testID={`compose-cc-${index}`}
              />
            </View>
            <Pressable
              onPress={() => removeCc(index)}
              style={[styles.removeBtn, { backgroundColor: colors.surfaceAlt }]}
              accessibilityLabel="Retirer cette copie"
            >
              <MaterialIcons name="close" size={18} color={colors.textSecondary} />
            </Pressable>
          </View>
        ))}

        <Button
          label="+ Ajouter une copie (Cc)"
          variant="ghost"
          onPress={addCc}
          testID="compose-add-cc"
        />

        <TextField
          label="Objet"
          value={subject}
          onChangeText={setSubject}
          placeholder="Objet du message"
          testID="compose-subject"
        />
        <TextField
          label="Message"
          value={body}
          onChangeText={setBody}
          placeholder="Votre message…"
          multiline
          testID="compose-body"
        />

        {error ? (
          <AppText variant="caption" color="danger">
            {error}
          </AppText>
        ) : null}

        <Button
          label="Envoyer"
          onPress={onSend}
          disabled={!canSend}
          loading={sending}
          fullWidth
          testID="compose-send"
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  form: {
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  ccRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.xs,
  },
  ccField: {
    flex: 1,
  },
  removeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
});
