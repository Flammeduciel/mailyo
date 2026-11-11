import { MaterialIcons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { formatFileSize } from '@/domain/attachments';
import type { ContactSuggestion } from '@/domain/contacts';
import { parseAddressList } from '@/domain/mime';
import type { Draft, EmailAddress } from '@/domain/models';
import type { PickedAttachment } from '@/services/mail-service';
import { useApp } from '@/state/app-context';
import { pickAttachments } from '@/state/pick-attachments';
import { useServiceQuery } from '@/state/use-service-query';
import { useUndoSend } from '@/state/use-undo-send';
import {
  AppText,
  Button,
  Header,
  Radius,
  RecipientField,
  Screen,
  Spacing,
  TextField,
  UndoSnackbar,
  useAppTheme,
} from '@/ui';

const AUTOSAVE_DELAY_MS = 1500;

export default function ComposeScreen() {
  const { service, invalidate } = useApp();
  const colors = useAppTheme();
  // Optional prefill, e.g. "Transférer" from a conversation.
  const params = useLocalSearchParams<{ to?: string; subject?: string; body?: string }>();
  const [toList, setToList] = useState<EmailAddress[]>(() => parseAddressList(params.to ?? ''));
  const [ccRecipients, setCcRecipients] = useState<EmailAddress[]>([]);
  const [ccOpen, setCcOpen] = useState(false);
  const [picking, setPicking] = useState<'to' | 'cc' | null>(null);
  const [subject, setSubject] = useState(params.subject ?? '');
  const [body, setBody] = useState(params.body ?? '');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<PickedAttachment[]>([]);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [draftSaved, setDraftSaved] = useState(false);
  const [dismissedResume, setDismissedResume] = useState(false);
  const undoSend = useUndoSend();
  const prefilled = Boolean(params.to || params.subject || params.body);

  const { data: accounts } = useServiceQuery((mailService) => mailService.listAccounts(), []);
  const { data: drafts } = useServiceQuery<Draft[]>(async (mailService) => {
    const [account] = await mailService.listAccounts();
    return account ? mailService.listDrafts(account.id) : [];
  }, []);
  const resumable = !prefilled && !dismissedResume && !draftId ? drafts[0] : undefined;

  const resumeDraft = (draft: Draft) => {
    setDraftId(draft.id);
    setToList(draft.to);
    setCcRecipients(draft.cc);
    setCcOpen(draft.cc.length > 0);
    setSubject(draft.subject);
    setBody(draft.body);
  };

  const to = toList.map((r) => r.address).join(', ');
  const cc = ccRecipients.map((r) => r.address).join(', ');

  // People already written to, plus saved contacts, for the recipient picker.
  const { data: contacts } = useServiceQuery<ContactSuggestion[]>(
    (mailService) => mailService.listContacts(),
    [],
  );
  const photoOf = (address: string) => service.getContactPhoto(address);

  // Autosave as a draft (local + Gmail) a moment after the user stops typing.
  const saving = useRef<Promise<string> | null>(null);
  const draftIdRef = useRef<string | null>(null);
  useEffect(() => {
    draftIdRef.current = draftId;
  }, [draftId]);
  useEffect(() => {
    const account = accounts[0];
    const empty = !to.trim() && !subject.trim() && !body.trim();
    if (!account || empty || undoSend.pending) {
      return;
    }
    const timer = setTimeout(() => {
      saving.current = service.saveDraft({
        draftId: draftIdRef.current,
        accountId: account.id,
        to,
        cc,
        subject,
        body,
      });
      void saving.current.then((id) => {
        setDraftId(id);
        setDraftSaved(true);
      });
    }, AUTOSAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [accounts, to, cc, subject, body, service, undoSend.pending]);

  const deliver = async () => {
    const account = accounts[0];
    if (!account) return;
    setSending(true);
    setError(null);
    try {
      const result = await service.send({
        accountId: account.id,
        to,
        cc,
        subject,
        body,
        attachments: picked,
      });
      if (result.status === 'sent') {
        const savedId = draftId ?? (saving.current ? await saving.current.catch(() => null) : null);
        if (savedId) await service.discardDraft(savedId);
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
  };

  const onSend = () => {
    if (!accounts[0]) {
      setError('Aucun compte configuré.');
      return;
    }
    undoSend.schedule(
      () => void deliver(),
      () => undefined,
    );
  };

  const onDiscard = async () => {
    if (draftId) await service.discardDraft(draftId);
    router.back();
  };

  const canSend = to.trim().length > 0 && accounts.length > 0 && !sending && !undoSend.pending;

  return (
    <Screen>
      <Header
        title="Nouveau message"
        subtitle={draftSaved ? 'Brouillon enregistré' : undefined}
        onBack={() => {
          undoSend.flush();
          router.back();
        }}
      />

      <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
        {resumable ? (
          <View style={[styles.resume, { backgroundColor: colors.primaryContainer }]}>
            <MaterialIcons name="edit-note" size={20} color={colors.primary} />
            <AppText variant="caption" style={styles.resumeText} numberOfLines={2}>
              Brouillon : {resumable.subject || '(Sans objet)'}
            </AppText>
            <Button label="Reprendre" variant="ghost" onPress={() => resumeDraft(resumable)} />
            <Pressable onPress={() => setDismissedResume(true)} accessibilityLabel="Ignorer">
              <MaterialIcons name="close" size={18} color={colors.textSecondary} />
            </Pressable>
          </View>
        ) : null}

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

        {picking !== 'cc' ? (
          <RecipientField
            label="À"
            recipients={toList}
            onChange={setToList}
            contacts={contacts}
            photoOf={photoOf}
            onPickingChange={(open) => setPicking(open ? 'to' : null)}
            autoFocus={!prefilled && toList.length === 0}
            testID="compose-to"
          />
        ) : null}

        {(ccOpen || ccRecipients.length > 0) && picking !== 'to' ? (
          <RecipientField
            label="Cc"
            recipients={ccRecipients}
            onChange={setCcRecipients}
            contacts={contacts}
            photoOf={photoOf}
            onPickingChange={(open) => setPicking(open ? 'cc' : null)}
            testID="compose-cc"
          />
        ) : null}

        {/* While choosing people, the suggestion list takes the screen (messaging-app style). */}
        {picking ? null : (
          <>
            {!ccOpen && ccRecipients.length === 0 ? (
              <Button
                label="+ Ajouter une copie (Cc)"
                variant="ghost"
                onPress={() => setCcOpen(true)}
                testID="compose-add-cc"
              />
            ) : null}

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

            {picked.map((file, index) => (
              <View
                key={`${file.uri}-${index}`}
                style={[styles.file, { backgroundColor: colors.surfaceAlt }]}
              >
                <MaterialIcons name="attach-file" size={18} color={colors.textSecondary} />
                <AppText variant="caption" style={styles.resumeText} numberOfLines={1}>
                  {file.filename} · {formatFileSize(file.sizeBytes)}
                </AppText>
                <Pressable
                  onPress={() => setPicked((previous) => previous.filter((_, i) => i !== index))}
                  accessibilityLabel={`Retirer ${file.filename}`}
                >
                  <MaterialIcons name="close" size={18} color={colors.textSecondary} />
                </Pressable>
              </View>
            ))}
            <Button
              label="Joindre un fichier"
              variant="ghost"
              onPress={() =>
                void pickAttachments().then((files) =>
                  setPicked((previous) => [...previous, ...files]),
                )
              }
              testID="compose-attach"
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
            {draftId ? (
              <Button
                label="Supprimer le brouillon"
                variant="ghost"
                onPress={() => void onDiscard()}
                testID="compose-discard"
              />
            ) : null}
          </>
        )}
      </ScrollView>
      {undoSend.pending ? (
        <UndoSnackbar
          message={`Envoi dans ${undoSend.pending.secondsLeft} s…`}
          onUndo={undoSend.cancel}
          testID="undo-send"
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  form: {
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  resume: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.md,
  },
  resumeText: {
    flex: 1,
  },
  file: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.sm,
    borderRadius: Radius.md,
  },
});
