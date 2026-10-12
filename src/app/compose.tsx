import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useApp } from '@/state/app-context';
import { useServiceQuery } from '@/state/use-service-query';
import { AppText, Button, Header, Screen, Spacing, TextField } from '@/ui';

export default function ComposeScreen() {
  const { service, invalidate } = useApp();
  const [to, setTo] = useState('');
  const [cc, setCc] = useState('');
  const [showCc, setShowCc] = useState(false);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: accounts } = useServiceQuery((mailService) => mailService.listAccounts(), []);

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
        setError('Statut d’envoi incertain : vérifiez le dossier « Messages envoyés ».');
      } else {
        setError(result.error ?? 'L’envoi a échoué.');
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

        {showCc ? (
          <TextField
            label="Copie (Cc)"
            value={cc}
            onChangeText={setCc}
            placeholder="cc@example.com"
            autoCapitalize="none"
            testID="compose-cc"
          />
        ) : (
          <Button label="Ajouter une copie" variant="ghost" onPress={() => setShowCc(true)} />
        )}

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
});
