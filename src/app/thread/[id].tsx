import * as Clipboard from 'expo-clipboard';
import { MaterialIcons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Pressable,
  StyleSheet,
  ToastAndroid,
  View,
  type ListRenderItem,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import type { Correspondence } from '@/data/repositories/messages';
import { copyChanges, joinNames } from '@/domain/copies';
import type { Attachment, EmailAddress, Message } from '@/domain/models';
import { splitQuotedText } from '@/domain/quote';
import { parseMessageIds } from '@/domain/threading';
import { useApp } from '@/state/app-context';
import { useServiceQuery } from '@/state/use-service-query';
import { useAttachmentActions } from '@/state/use-attachment-actions';
import { pickFrom, type AttachmentSource } from '@/state/pick-attachments';
import { useUndoSend } from '@/state/use-undo-send';
import type { PickedAttachment, SendMessageInput } from '@/services/mail-service';
import { AttachmentViewer } from '@/ui/AttachmentViewer';
import { formatFileSize } from '@/domain/attachments';
import { isNoReplyAddress } from '@/domain/contacts';
import { hostOf, parseListUnsubscribe } from '@/domain/html-privacy';
import { openLink } from '@/ui/open-link';
import {
  AppBar,
  AppText,
  Avatar,
  AttachmentPickerSheet,
  PeopleSheet,
  ThreadSkeleton,
  UndoSnackbar,
  ChatComposer,
  ContactSheet,
  EmptyState,
  MessageBubble,
  PopupMenu,
  Radius,
  Spacing,
  SwipeToReply,
  messageSnippet,
  useAppTheme,
  type AppBarAction,
  type QuotedParent,
} from '@/ui';

interface ThreadData {
  messages: Message[];
  attachments: Record<string, Attachment[]>;
  isSpam: boolean;
  selfAddress: string;
  /** Reference time for day labels, captured when the data is loaded. */
  now: number;
}

const INITIAL: ThreadData = {
  messages: [],
  attachments: {},
  isSpam: false,
  selfAddress: '',
  now: 0,
};

type Row =
  | { type: 'message'; key: string; message: Message; showSender: boolean }
  | { type: 'day'; key: string; label: string }
  | { type: 'copy'; key: string; text: string; added: boolean; people: EmailAddress[] };

const MONTHS = [
  'janvier',
  'fevrier',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'aout',
  'septembre',
  'octobre',
  'novembre',
  'decembre',
];

function dayKey(timestamp: number): string {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

/** "Aujourd'hui", "Hier", or "12 mars 2026" */
function dayLabel(timestamp: number, now: number): string {
  const startOf = (value: number) => {
    const d = new Date(value);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  };
  const days = Math.round((startOf(now) - startOf(timestamp)) / 86_400_000);
  if (days <= 0) return "Aujourd'hui";
  if (days === 1) return 'Hier';
  const date = new Date(timestamp);
  return `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

export default function ThreadScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useAppTheme();
  const insets = useSafeAreaInsets();
  const { service, invalidate } = useApp();
  const list = useRef<FlatList<Row>>(null);

  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [highlighted, setHighlighted] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [keyboardShown, setKeyboardShown] = useState(false);
  const [viewedIndex, setViewedIndex] = useState<number | null>(null);
  const attachmentActions = useAttachmentActions();
  const undoSend = useUndoSend();
  const resolveAttachment = attachmentActions.resolve;
  const autoPreviewMaxBytes = service.getSettings().autoPreviewMaxMb * 1024 * 1024;

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setKeyboardShown(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardShown(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  const { data, loading, reload } = useServiceQuery<ThreadData>(async (mailService) => {
    const messages = await mailService.openThread(id);
    const account = messages[0] ? await mailService.getAccountById(messages[0].accountId) : null;
    const attachments = await mailService.getThreadAttachments(id);
    const isSpam = await mailService.isThreadSpam(id);
    return {
      messages,
      attachments,
      isSpam,
      selfAddress: account?.emailAddress ?? '',
      now: Date.now(),
    };
  }, INITIAL);

  // Every attachment of the conversation, oldest first: the viewer swipes through them.
  const allAttachments = useMemo(
    () => data.messages.flatMap((message) => data.attachments[message.id] ?? []),
    [data.messages, data.attachments],
  );
  const openAttachment = useCallback(
    (attachment: Attachment) => {
      const index = allAttachments.findIndex((item) => item.id === attachment.id);
      setViewedIndex(index >= 0 ? index : null);
    },
    [allAttachments],
  );
  const attachmentsSize = allAttachments.reduce((sum, item) => sum + item.sizeBytes, 0);

  const self = data.selfAddress.toLowerCase();
  const isOwn = useCallback(
    (message: Message) => message.senderAddress.toLowerCase() === self,
    [self],
  );

  // The other party: last sender who is not us (falls back to our recipient).
  const correspondent = useMemo(() => {
    for (let i = data.messages.length - 1; i >= 0; i -= 1) {
      const message = data.messages[i];
      if (!isOwn(message)) {
        return message.senderName || message.senderAddress;
      }
    }
    const first = data.messages[0]?.to[0];
    return first ? first.name || first.address : '';
  }, [data.messages, isOwn]);

  // Raw email address of the other party (for contact profile + no-reply check).
  const correspondentAddress = useMemo(() => {
    for (let i = data.messages.length - 1; i >= 0; i -= 1) {
      const message = data.messages[i];
      if (!isOwn(message)) {
        return message.senderAddress;
      }
    }
    return data.messages[0]?.to[0]?.address ?? '';
  }, [data.messages, isOwn]);

  const noReply = correspondentAddress.length > 0 && isNoReplyAddress(correspondentAddress);

  const subject = data.messages[data.messages.length - 1]?.subject || '(Sans objet)';

  // Default reply target: the last message that is not ours.
  const defaultReplyTarget = useMemo<Message | undefined>(() => {
    for (let i = data.messages.length - 1; i >= 0; i -= 1) {
      if (!isOwn(data.messages[i])) {
        return data.messages[i];
      }
    }
    return data.messages[data.messages.length - 1];
  }, [data.messages, isOwn]);

  // Resolve In-Reply-To to the quoted parent inside this conversation.
  const parents = useMemo(() => {
    const byMessageId = new Map<string, Message>();
    for (const message of data.messages) {
      for (const messageId of parseMessageIds(message.messageIdHeader)) {
        byMessageId.set(messageId, message);
      }
    }
    const result = new Map<string, { quote: QuotedParent; adjacent: boolean }>();
    data.messages.forEach((message, index) => {
      const parentId = parseMessageIds(message.inReplyTo)[0];
      const parent = parentId ? byMessageId.get(parentId) : undefined;
      if (parent && parent.id !== message.id) {
        result.set(message.id, {
          quote: {
            id: parent.id,
            senderName: parent.senderName || parent.senderAddress,
            snippet: messageSnippet(parent),
            isOwn: isOwn(parent),
          },
          // Like a chat app, a reply to the message just above needs no quote.
          adjacent: data.messages[index - 1]?.id === parent.id,
        });
      }
    });
    return result;
  }, [data.messages, isOwn]);

  // Newest first for the inverted list, with a day chip above each day.
  const rows = useMemo<Row[]>(() => {
    const { now } = data;
    const changes = copyChanges(data.messages, data.selfAddress);
    const isOwnAddress = (address: string) => address.toLowerCase() === self;
    const chronological: Row[] = [];
    let currentDay = '';
    let previousSender = '';
    for (const message of data.messages) {
      const key = dayKey(message.receivedAt);
      if (key !== currentDay) {
        currentDay = key;
        previousSender = '';
        chronological.push({
          type: 'day',
          key: `day-${key}`,
          label: dayLabel(message.receivedAt, now),
        });
      }
      // « Marc a été ajouté en copie » when the Cc list changes along the thread.
      const change = changes.get(message.id);
      const by = isOwnAddress(message.senderAddress)
        ? 'vous'
        : message.senderName || message.senderAddress;
      if (change?.added.length) {
        chronological.push({
          type: 'copy',
          key: `cc-add-${message.id}`,
          added: true,
          people: change.added,
          text: `${joinNames(change.added)} ajouté${change.added.length > 1 ? 's' : ''} en copie par ${by}`,
        });
      }
      if (change?.removed.length) {
        chronological.push({
          type: 'copy',
          key: `cc-del-${message.id}`,
          added: false,
          people: change.removed,
          text: `${joinNames(change.removed)} ${change.removed.length > 1 ? 'ne sont' : 'n’est'} plus en copie`,
        });
      }
      const sender = message.senderAddress.toLowerCase();
      chronological.push({
        type: 'message',
        key: message.id,
        message,
        // Only at the start of a run, like a group chat.
        showSender: sender !== previousSender,
      });
      previousSender = sender;
    }
    return chronological.reverse();
  }, [data, self]);

  const jumpTo = useCallback(
    (messageId: string) => {
      const index = rows.findIndex((row) => row.type === 'message' && row.message.id === messageId);
      if (index < 0) {
        return;
      }
      list.current?.scrollToIndex({ index, viewPosition: 0.5, animated: true });
      setHighlighted(messageId);
      setTimeout(() => setHighlighted(null), 1500);
    },
    [rows],
  );

  // ----------------------------------------------------------------- actions

  const goBack = () => {
    undoSend.flush();
    invalidate();
    router.back();
  };

  // Contact sheet: the correspondent, or anyone shown in copy under a bubble.
  const [sheetPerson, setSheetPerson] = useState<{ name: string; address: string } | null>(null);
  const [correspondence, setCorrespondence] = useState<Correspondence>();

  const openPerson = (person: { name: string; address: string }) => {
    Keyboard.dismiss();
    setCorrespondence(undefined);
    setSheetPerson(person);
    void service.getCorrespondence(person.address).then(setCorrespondence);
  };

  // People in copy: one → their contact; several → pick in a sheet first.
  const [copyPeople, setCopyPeople] = useState<EmailAddress[] | null>(null);
  const onCopyPress = (people: EmailAddress[]) => {
    if (people.length === 1) openPerson(people[0]);
    else setCopyPeople(people);
  };

  const openContactProfile = () => {
    if (!correspondentAddress) {
      return;
    }
    openPerson({ name: correspondent, address: correspondentAddress });
  };

  const [picked, setPicked] = useState<PickedAttachment[]>([]);

  const [attachOpen, setAttachOpen] = useState(false);

  const onAttachPick = async (source: AttachmentSource) => {
    setAttachOpen(false);
    // Let the sheet finish closing: a picker opened during the animation can be dropped (iOS).
    await new Promise((resolve) => setTimeout(resolve, 300));
    const files = await pickFrom(source);
    if (files.length > 0) setPicked((previous) => [...previous, ...files]);
  };

  const deliver = async (input: SendMessageInput) => {
    setSending(true);
    try {
      const result = await service.send(input);
      if (result.status === 'sent') {
        await reload();
        invalidate();
      } else {
        // Give the text back so nothing is lost.
        setDraft(input.body);
        setPicked(input.attachments ?? []);
        Alert.alert(
          result.status === 'ambiguous' ? 'Envoi incertain' : "Échec de l'envoi",
          result.status === 'ambiguous'
            ? 'Vérifiez le dossier Envoyés avant de renvoyer.'
            : (result.error ?? "Le message n'a pas pu être envoyé."),
        );
      }
    } finally {
      setSending(false);
    }
  };

  // The message leaves after a short delay, during which "Annuler" takes it back.
  const onSend = () => {
    const body = draft.trim();
    const target = replyTo ?? defaultReplyTarget;
    if ((body.length === 0 && picked.length === 0) || !target) {
      return;
    }
    const input: SendMessageInput = {
      accountId: target.accountId,
      to: '',
      subject: '',
      body,
      replyToMessageId: target.id,
      mode: 'reply',
      attachments: picked,
    };
    const previousReply = replyTo;
    setDraft('');
    setPicked([]);
    setReplyTo(null);
    undoSend.schedule(
      () => void deliver(input),
      () => {
        setDraft(input.body);
        setPicked(input.attachments ?? []);
        setReplyTo(previousReply);
      },
    );
  };

  const selectedMessages = useMemo(
    () => data.messages.filter((message) => selected.has(message.id)),
    [data.messages, selected],
  );
  const clearSelection = useCallback(() => setSelected(new Set()), []);
  const toggleSelected = useCallback((messageId: string) => {
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(messageId)) {
        next.delete(messageId);
      } else {
        next.add(messageId);
      }
      return next;
    });
  }, []);

  const forward = useCallback((message: Message) => {
    const date = new Date(message.receivedAt).toLocaleString('fr-FR');
    router.push({
      pathname: '/compose',
      params: {
        subject: /^(fwd|tr)\s*:/i.test(message.subject)
          ? message.subject
          : `Tr : ${message.subject}`,
        body:
          `\n\n---------- Message transfere ----------\n` +
          `De : ${message.senderName} <${message.senderAddress}>\nDate : ${date}\n` +
          `Objet : ${message.subject}\n\n${message.bodyText}`,
      },
    });
  }, []);

  const allStarred = selectedMessages.length > 0 && selectedMessages.every((m) => m.isStarred);

  const selectionActions: AppBarAction[] = [
    ...(selectedMessages.length === 1
      ? [
          {
            icon: 'reply',
            label: 'Repondre',
            onPress: () => {
              setReplyTo(selectedMessages[0]);
              clearSelection();
            },
            testID: 'message-reply',
          },
        ]
      : []),
    {
      icon: allStarred ? 'star' : 'star-border',
      label: allStarred ? 'Retirer des favoris' : 'Ajouter aux favoris',
      onPress: () =>
        void (async () => {
          for (const message of selectedMessages) {
            await service.toggleStar(message.id, !allStarred);
          }
          clearSelection();
          await reload();
          invalidate();
        })(),
      testID: 'message-star',
    },
    {
      icon: 'content-copy',
      label: 'Copier',
      onPress: () =>
        void (async () => {
          await Clipboard.setStringAsync(
            selectedMessages.map((message) => messageSnippetFull(message)).join('\n\n'),
          );
          clearSelection();
        })(),
      testID: 'message-copy',
    },
    ...(selectedMessages.length === 1
      ? [
          {
            icon: 'shortcut',
            label: 'Transferer',
            onPress: () => {
              forward(selectedMessages[0]);
              clearSelection();
            },
            testID: 'message-forward',
          },
        ]
      : []),
    {
      icon: 'delete-outline',
      label: 'Supprimer',
      onPress: () =>
        Alert.alert('Supprimer ?', 'Les emails selectionnes iront dans la corbeille.', [
          { text: 'Annuler', style: 'cancel' },
          {
            text: 'Supprimer',
            style: 'destructive',
            onPress: () =>
              void (async () => {
                for (const message of selectedMessages) {
                  await service.deleteMessageById(message.id);
                }
                clearSelection();
                await reload();
                invalidate();
              })(),
          },
        ]),
      testID: 'message-delete',
    },
  ];

  const threadStarred = data.messages.some((message) => message.isStarred);
  // Newsletter: the most recent List-Unsubscribe of the correspondent.
  const unsubscribe = useMemo(() => {
    for (let i = data.messages.length - 1; i >= 0; i -= 1) {
      const targets = parseListUnsubscribe(data.messages[i].listUnsubscribe);
      if (targets.url || targets.mailto) return targets;
    }
    return null;
  }, [data.messages]);

  const onUnsubscribe = () => {
    if (!unsubscribe) return;
    Alert.alert(
      'Se désabonner ?',
      unsubscribe.url
        ? `La page de désabonnement de ${hostOf(unsubscribe.url) ?? 'l’expéditeur'} va s’ouvrir.`
        : 'Un email de désabonnement sera envoyé à l’expéditeur.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Se désabonner',
          style: 'destructive',
          onPress: () =>
            void (async () => {
              if (unsubscribe.url) {
                await openLink(unsubscribe.url);
                return;
              }
              const mailto = unsubscribe.mailto ?? '';
              const [address, query = ''] = mailto.replace(/^mailto:/i, '').split('?');
              const subject = new URLSearchParams(query).get('subject') ?? 'unsubscribe';
              const target = defaultReplyTarget;
              if (!target) return;
              const result = await service.send({
                accountId: target.accountId,
                to: decodeURIComponent(address),
                subject,
                body: 'unsubscribe',
              });
              ToastAndroid.show(
                result.status === 'sent' ? 'Demande de désabonnement envoyée' : 'Échec de l’envoi',
                ToastAndroid.SHORT,
              );
            })(),
        },
      ],
    );
  };

  const toggleSpam = async () => {
    await service.setThreadSpam(id, !data.isSpam);
    ToastAndroid.show(
      data.isSpam ? 'Remis dans la boîte de réception' : 'Signalé comme spam',
      ToastAndroid.SHORT,
    );
    await reload();
    invalidate();
  };

  const menuItems = [
    ...(unsubscribe ? [{ label: 'Se désabonner', onPress: onUnsubscribe }] : []),
    {
      label: data.isSpam ? 'Ce n’est pas du spam' : 'Signaler comme spam',
      onPress: () => void toggleSpam(),
    },
    {
      label: 'Marquer comme non lu',
      onPress: () =>
        void (async () => {
          await service.markThreadRead(id, false);
          goBack();
        })(),
    },
    {
      label: 'Archiver',
      onPress: () =>
        void (async () => {
          await service.archiveThread(id);
          goBack();
        })(),
    },
    {
      label: 'Supprimer la conversation',
      destructive: true,
      onPress: () =>
        void (async () => {
          await service.deleteThread(id);
          goBack();
        })(),
    },
  ];

  // ------------------------------------------------------------------ render

  const renderItem: ListRenderItem<Row> = ({ item }) => {
    if (item.type === 'copy') {
      return (
        <Pressable
          style={styles.dayRow}
          onPress={() => onCopyPress(item.people)}
          accessibilityRole="button"
          testID={item.key}
        >
          <View style={[styles.copyChip, { backgroundColor: colors.surface }]}>
            <MaterialIcons
              name={item.added ? 'person-add-alt' : 'person-remove'}
              size={14}
              color={item.added ? colors.primary : colors.textMuted}
            />
            <AppText
              variant="caption"
              color="textSecondary"
              numberOfLines={2}
              style={styles.copyText}
            >
              {item.text}
            </AppText>
          </View>
        </Pressable>
      );
    }
    if (item.type === 'day') {
      return (
        <View style={styles.dayRow}>
          <View style={[styles.dayChip, { backgroundColor: colors.surface }]}>
            <AppText variant="caption" color="textSecondary">
              {item.label}
            </AppText>
          </View>
        </View>
      );
    }
    const { message } = item;
    const selecting = selected.size > 0;
    return (
      <SwipeToReply onReply={() => setReplyTo(message)} enabled={!selecting}>
        <MessageBubble
          message={message}
          isOwn={isOwn(message)}
          showSender={item.showSender}
          quoted={parents.get(message.id)?.adjacent ? undefined : parents.get(message.id)?.quote}
          parentInThread={parents.has(message.id)}
          onQuotePress={jumpTo}
          attachments={data.attachments[message.id]}
          onOpenAttachment={openAttachment}
          resolveAttachment={resolveAttachment}
          onSaveAttachment={(attachment) => void attachmentActions.save(attachment)}
          attachmentProgress={attachmentActions.progress}
          autoPreviewMaxBytes={autoPreviewMaxBytes}
          pdfPreview={attachmentActions.pdfPreview}
          blockRemoteImages={service.getSettings().blockRemoteImages}
          onCopyPress={onCopyPress}
          photoOf={(address) => service.getContactPhoto(address)}
          selected={selected.has(message.id)}
          highlighted={highlighted === message.id}
          onPress={selecting ? () => toggleSelected(message.id) : undefined}
          onLongPress={() => toggleSelected(message.id)}
          testID={`message-${message.id}`}
        />
      </SwipeToReply>
    );
  };

  return (
    <SafeAreaView edges={['top']} style={[styles.screen, { backgroundColor: colors.background }]}>
      {selected.size > 0 ? (
        <AppBar title={String(selected.size)} onBack={clearSelection} actions={selectionActions} />
      ) : (
        <AppBar
          title={correspondent || subject}
          subtitle={subject}
          onBack={goBack}
          onTitlePress={openContactProfile}
          leading={
            <Pressable onPress={openContactProfile} accessibilityLabel="Voir le profil">
              <Avatar
                name={correspondent || subject}
                size={38}
                imageUri={service.getContactPhoto(correspondentAddress)}
              />
            </Pressable>
          }
          actions={[
            {
              icon: threadStarred ? 'star' : 'star-border',
              label: threadStarred ? 'Retirer des favoris' : 'Ajouter aux favoris',
              onPress: () =>
                void (async () => {
                  await service.setThreadStarred(id, !threadStarred);
                  await reload();
                  invalidate();
                })(),
              testID: 'thread-star',
            },
            {
              icon: 'more-vert',
              label: "Plus d'options",
              onPress: () => setMenuOpen(true),
              testID: 'thread-menu',
            },
          ]}
        />
      )}

      <KeyboardAvoidingView
        behavior="padding"
        style={[styles.body, { backgroundColor: colors.chatBackground }]}
      >
        {data.isSpam ? (
          <View style={[styles.spamBar, { backgroundColor: colors.danger + '1A' }]}>
            <MaterialIcons name="report" size={20} color={colors.danger} />
            <AppText variant="caption" style={styles.filesText}>
              Classé comme spam par Gmail. Méfiez-vous des liens et des pièces jointes.
            </AppText>
            <Pressable
              onPress={() => void toggleSpam()}
              hitSlop={Spacing.sm}
              testID="thread-not-spam"
            >
              <AppText variant="caption" weight="semibold" style={{ color: colors.link }}>
                Pas un spam
              </AppText>
            </Pressable>
          </View>
        ) : null}

        {allAttachments.length > 0 ? (
          <Pressable
            onPress={() => router.push({ pathname: '/files/[id]', params: { id } })}
            style={[
              styles.filesBar,
              { backgroundColor: colors.surface, borderBottomColor: colors.border },
            ]}
            accessibilityRole="button"
            testID="thread-files"
          >
            <MaterialIcons name="attach-file" size={18} color={colors.primary} />
            <AppText variant="caption" weight="semibold" style={styles.filesText}>
              {allAttachments.length} pièce{allAttachments.length > 1 ? 's' : ''} jointe
              {allAttachments.length > 1 ? 's' : ''} · {formatFileSize(attachmentsSize)}
            </AppText>
            <AppText variant="caption" style={{ color: colors.link }}>
              Voir tout
            </AppText>
            <MaterialIcons name="chevron-right" size={18} color={colors.link} />
          </Pressable>
        ) : null}

        <FlatList
          ref={list}
          inverted
          data={rows}
          keyExtractor={(row) => row.key}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          onScrollToIndexFailed={() => undefined}
        />

        {/* Outside the inverted list: inside it, the text came out upside down. */}
        {rows.length === 0 ? (
          <View style={styles.overlay} pointerEvents="none">
            {loading ? (
              <ThreadSkeleton />
            ) : (
              <EmptyState title="Conversation vide" description="Aucun message dans ce fil." />
            )}
          </View>
        ) : null}

        {undoSend.pending ? (
          <UndoSnackbar
            message={`Envoi dans ${undoSend.pending.secondsLeft} s…`}
            onUndo={undoSend.cancel}
            testID="undo-send"
          />
        ) : null}

        {noReply ? (
          <View
            style={[
              styles.noReplyBanner,
              {
                backgroundColor: colors.surface,
                borderTopColor: colors.border,
                paddingBottom: Math.max(insets.bottom, Spacing.sm),
              },
            ]}
          >
            <MaterialIcons name="block" size={18} color={colors.textMuted} />
            <AppText variant="caption" color="textMuted" style={styles.noReplyText}>
              Cette adresse ne recoit pas de reponses.
            </AppText>
          </View>
        ) : (
          <ChatComposer
            value={draft}
            onChangeText={setDraft}
            onSend={onSend}
            attachments={picked}
            onAttach={() => setAttachOpen(true)}
            onRemoveAttachment={(index) =>
              setPicked((previous) => previous.filter((_, i) => i !== index))
            }
            sending={sending}
            replyTo={
              replyTo
                ? {
                    senderName: isOwn(replyTo)
                      ? 'Vous'
                      : replyTo.senderName || replyTo.senderAddress,
                    snippet: messageSnippet(replyTo),
                  }
                : null
            }
            onCancelReply={() => setReplyTo(null)}
            bottomInset={keyboardShown ? 0 : insets.bottom}
          />
        )}
      </KeyboardAvoidingView>

      <AttachmentViewer
        attachments={allAttachments}
        index={viewedIndex}
        resolve={resolveAttachment}
        allowDownload={attachmentActions.allowDownload}
        onSave={(attachment) => void attachmentActions.save(attachment)}
        onShare={(attachment) => void attachmentActions.share(attachment)}
        progress={attachmentActions.progress}
        onClose={() => setViewedIndex(null)}
      />

      <AttachmentPickerSheet
        visible={attachOpen}
        onPick={(source) => void onAttachPick(source)}
        onClose={() => setAttachOpen(false)}
      />

      <PopupMenu visible={menuOpen} items={menuItems} onClose={() => setMenuOpen(false)} />

      {copyPeople ? (
        <PeopleSheet
          title="En copie"
          people={copyPeople}
          photoOf={(address) => service.getContactPhoto(address)}
          onPick={(person) => {
            setCopyPeople(null);
            openPerson(person);
          }}
          onClose={() => setCopyPeople(null)}
        />
      ) : null}

      {sheetPerson ? (
        <ContactSheet
          visible
          onClose={() => setSheetPerson(null)}
          name={
            service.getContactDetails(sheetPerson.address)?.name ||
            sheetPerson.name ||
            sheetPerson.address
          }
          address={sheetPerson.address}
          photoUri={service.getContactPhoto(sheetPerson.address)}
          details={service.getContactDetails(sheetPerson.address)}
          stats={correspondence}
          onCompose={() => {
            setSheetPerson(null);
            router.push({ pathname: '/compose', params: { to: sheetPerson.address } });
          }}
          onCopyAddress={() => {
            void Clipboard.setStringAsync(sheetPerson.address);
            ToastAndroid.show('Adresse copiée', ToastAndroid.SHORT);
          }}
          onCall={(phone) => void Linking.openURL(`tel:${phone.replace(/[^\d+]/g, '')}`)}
        />
      ) : null}
    </SafeAreaView>
  );
}

/** Own text of a message (quoted history excluded, line breaks kept), for "Copier". */
function messageSnippetFull(message: Message): string {
  return splitQuotedText(message.bodyText).body || message.subject;
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  body: {
    flex: 1,
  },
  list: {
    paddingVertical: Spacing.sm,
  },
  dayRow: {
    alignItems: 'center',
    paddingVertical: Spacing.sm,
  },
  copyChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    maxWidth: '86%',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.lg,
  },
  copyText: {
    flexShrink: 1,
    textAlign: 'center',
  },
  dayChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.md,
  },
  filesBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  spamBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  filesText: {
    flex: 1,
  },
  overlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noReplyBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    paddingTop: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  noReplyText: {
    textAlign: 'center',
  },
});
