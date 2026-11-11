import { MaterialIcons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { formatFileSize } from '@/domain/attachments';
import type { ContactSuggestion } from '@/domain/contacts';
import { parseAddressList } from '@/domain/mime';
import type { Draft, EmailAddress } from '@/domain/models';
import type { PickedAttachment } from '@/services/mail-service';
import { useApp } from '@/state/app-context';
import { pickFrom, type AttachmentSource } from '@/state/pick-attachments';
import { useServiceQuery } from '@/state/use-service-query';
import { useUndoSend } from '@/state/use-undo-send';
import {
  AppBar,
  AppText,
  AttachmentPickerSheet,
  Button,
  ComposeAttachmentCard,
  Radius,
  RecipientField,
  Spacing,
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
  const [dismissedResume, setDismissedResume] = useState(false);
  const undoSend = useUndoSend();
  const prefilled = Boolean(params.to || params.subject || params.body);

  const to = toList.map((r) => r.address).join(', ');
  const cc = ccRecipients.map((r) => r.address).join(', ');
  // Nothing typed, chosen or attached yet: it is not a draft.
  const hasContent =
    toList.length > 0 ||
    ccRecipients.length > 0 ||
    subject.trim().length > 0 ||
    body.trim().length > 0 ||
    picked.length > 0;

  const { data: accounts } = useServiceQuery((mailService) => mailService.listAccounts(), []);
  const { data: drafts } = useServiceQuery<Draft[]>(async (mailService) => {
    const [account] = await mailService.listAccounts();
    const all = account ? await mailService.listDrafts(account.id) : [];
    // Leftover empty drafts are noise: never offered.
    return all.filter((d) => d.to.length > 0 || d.subject.trim() || d.body.trim());
  }, []);
  const resumable =
    !prefilled && !dismissedResume && !draftId && !hasContent ? drafts[0] : undefined;

  // People already written to (no-reply excluded), for the recipient picker.
  const { data: contacts } = useServiceQuery<ContactSuggestion[]>(
    (mailService) => mailService.listContacts(),
    [],
  );
  const photoOf = (address: string) => service.getContactPhoto(address);

  const resumeDraft = (draft: Draft) => {
    setDraftId(draft.id);
    setToList(draft.to);
    setCcRecipients(draft.cc);
    setCcOpen(draft.cc.length > 0);
    setSubject(draft.subject);
    setBody(draft.body);
  };

  // Autosave (local + Gmail) a moment after the user stops typing; emptying
  // every field removes the draft again.
  const saving = useRef<Promise<string> | null>(null);
  const draftIdRef = useRef<string | null>(null);
  useEffect(() => {
    draftIdRef.current = draftId;
  }, [draftId]);
  useEffect(() => {
    const account = accounts[0];
    if (!account || undoSend.pending) {
      return;
    }
    const timer = setTimeout(() => {
      if (!hasContent) {
        const existing = draftIdRef.current;
        if (existing) {
          void service.discardDraft(existing);
          setDraftId(null);
        }
        return;
      }
      saving.current = service.saveDraft({
        draftId: draftIdRef.current,
        accountId: account.id,
        to,
        cc,
        subject,
        body,
      });
      void saving.current.then(setDraftId);
    }, AUTOSAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [accounts, to, cc, subject, body, hasContent, service, undoSend.pending]);

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
      setError(
        result.status === 'ambiguous'
          ? `Statut d'envoi incertain : vérifiez le dossier « Messages envoyés ».`
          : (result.error ?? `L'envoi a échoué.`),
      );
    } finally {
      setSending(false);
    }
  };

  const canSend = toList.length > 0 && accounts.length > 0 && !sending && !undoSend.pending;

  const onSend = () => {
    if (!accounts[0]) {
      setError('Aucun compte configuré.');
      return;
    }
    if (canSend) {
      undoSend.schedule(
        () => void deliver(),
        () => undefined,
      );
    }
  };

  const [attachOpen, setAttachOpen] = useState(false);

  const onAttachPick = async (source: AttachmentSource) => {
    setAttachOpen(false);
    // Let the sheet finish closing: a picker opened during the animation can be dropped (iOS).
    await new Promise((resolve) => setTimeout(resolve, 300));
    const files = await pickFrom(source);
    if (files.length > 0) setPicked((previous) => [...previous, ...files]);
  };

  const onDiscard = async () => {
    if (draftId) await service.discardDraft(draftId);
    router.back();
  };

  const totalSize = picked.reduce((sum, file) => sum + file.sizeBytes, 0);

  return (
    <SafeAreaView
      edges={['top', 'bottom']}
      style={[styles.screen, { backgroundColor: colors.background }]}
    >
      <AppBar
        title="Nouveau message"
        subtitle={hasContent && draftId ? 'Brouillon enregistré' : undefined}
        onBack={() => {
          undoSend.flush();
          router.back();
        }}
        actions={
          hasContent && !picking
            ? [
                {
                  icon: 'delete-outline',
                  label: 'Supprimer le brouillon',
                  onPress: () => void onDiscard(),
                  testID: 'compose-discard',
                },
              ]
            : []
        }
      />

      <KeyboardAvoidingView behavior="padding" style={styles.screen}>
        <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
          {resumable ? (
            <View style={[styles.resume, { backgroundColor: colors.primaryContainer }]}>
              <MaterialIcons name="edit-note" size={20} color={colors.primary} />
              <AppText variant="caption" style={styles.flex} numberOfLines={2}>
                Brouillon : {resumable.subject || '(Sans objet)'}
              </AppText>
              <Button label="Reprendre" variant="ghost" onPress={() => resumeDraft(resumable)} />
              <Pressable onPress={() => setDismissedResume(true)} accessibilityLabel="Ignorer">
                <MaterialIcons name="close" size={18} color={colors.textSecondary} />
              </Pressable>
            </View>
          ) : null}

          {picking ? null : (
            <View style={[styles.line, { borderBottomColor: colors.border }]}>
              <AppText variant="body" color="textSecondary" style={styles.label}>
                De
              </AppText>
              <AppText variant="body" numberOfLines={1} style={styles.flex}>
                {accounts[0]?.emailAddress ?? 'Aucun compte configuré'}
              </AppText>
            </View>
          )}

          {picking !== 'cc' ? (
            <View style={styles.recipientRow}>
              <View style={styles.flex}>
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
              </View>
              {!picking && !ccOpen && ccRecipients.length === 0 ? (
                <Pressable
                  onPress={() => setCcOpen(true)}
                  hitSlop={Spacing.sm}
                  style={styles.ccToggle}
                  accessibilityRole="button"
                  accessibilityLabel="Ajouter une copie (Cc)"
                  testID="compose-add-cc"
                >
                  <AppText variant="body" weight="semibold" style={{ color: colors.primary }}>
                    Cc
                  </AppText>
                </Pressable>
              ) : null}
            </View>
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

          {/* While choosing people, the suggestions take the screen (messaging-app style). */}
          {picking ? null : (
            <>
              <View style={[styles.line, { borderBottomColor: colors.border }]}>
                <TextInput
                  value={subject}
                  onChangeText={setSubject}
                  placeholder="Objet"
                  placeholderTextColor={colors.textMuted}
                  style={[styles.subject, { color: colors.text }]}
                  testID="compose-subject"
                />
              </View>

              <TextInput
                value={body}
                onChangeText={setBody}
                placeholder="Rédigez votre message"
                placeholderTextColor={colors.textMuted}
                multiline
                textAlignVertical="top"
                style={[styles.body, { color: colors.text }]}
                testID="compose-body"
              />

              {picked.length > 0 ? (
                <View style={styles.files}>
                  <AppText variant="caption" weight="semibold" color="textSecondary">
                    {picked.length} pièce{picked.length > 1 ? 's' : ''} jointe
                    {picked.length > 1 ? 's' : ''}
                    {totalSize > 0 ? ` · ${formatFileSize(totalSize)}` : ''}
                  </AppText>
                  {picked.map((file, index) => (
                    <ComposeAttachmentCard
                      key={`${file.uri}-${index}`}
                      file={file}
                      onRename={(filename) =>
                        setPicked((previous) =>
                          previous.map((item, i) => (i === index ? { ...item, filename } : item)),
                        )
                      }
                      onRemove={() =>
                        setPicked((previous) => previous.filter((_, i) => i !== index))
                      }
                      testID={`compose-file-${index}`}
                    />
                  ))}
                </View>
              ) : null}

              {error ? (
                <AppText variant="caption" color="danger">
                  {error}
                </AppText>
              ) : null}

              {accounts.length === 0 ? (
                <Button
                  label="Ajouter un compte"
                  variant="secondary"
                  onPress={() => router.push('/login')}
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

        {picking ? null : (
          <View style={[styles.toolbar, { borderTopColor: colors.border }]}>
            <Pressable
              onPress={() => setAttachOpen(true)}
              style={[styles.tool, { backgroundColor: colors.surfaceAlt }]}
              accessibilityRole="button"
              accessibilityLabel="Joindre un fichier"
              testID="compose-attach"
            >
              <MaterialIcons name="attach-file" size={20} color={colors.primary} />
              <AppText variant="caption" weight="semibold" style={{ color: colors.primary }}>
                Joindre
              </AppText>
            </Pressable>
            <View style={styles.flex} />
            <Pressable
              onPress={onSend}
              disabled={!canSend}
              style={[
                styles.send,
                { backgroundColor: colors.primary, opacity: canSend ? 1 : 0.45 },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Envoyer"
              accessibilityState={{ disabled: !canSend }}
              testID="compose-send"
            >
              <AppText variant="body" weight="semibold" style={{ color: colors.onPrimary }}>
                {sending ? 'Envoi…' : 'Envoyer'}
              </AppText>
              <MaterialIcons name="send" size={18} color={colors.onPrimary} />
            </Pressable>
          </View>
        )}
      </KeyboardAvoidingView>
      <AttachmentPickerSheet
        visible={attachOpen}
        onPick={(source) => void onAttachPick(source)}
        onClose={() => setAttachOpen(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  form: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xl,
    gap: Spacing.xs,
  },
  resume: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.md,
  },
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    minHeight: 48,
    borderBottomWidth: StyleSheet.hairlineWidth * 2,
  },
  label: {
    minWidth: 32,
  },
  recipientRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  ccToggle: {
    paddingTop: Spacing.md,
    paddingLeft: Spacing.sm,
  },
  subject: {
    flex: 1,
    fontSize: 16,
    paddingVertical: Spacing.sm,
  },
  body: {
    minHeight: 220,
    fontSize: 16,
    lineHeight: 22,
    paddingTop: Spacing.md,
  },
  files: {
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  tool: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.lg,
  },
  send: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm + 2,
    borderRadius: 24,
  },
});
