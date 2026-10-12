import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, StyleSheet, TextInput, View, type ListRenderItem } from 'react-native';

import type { Message } from '@/domain/models';
import { useApp } from '@/state/app-context';
import { useServiceQuery } from '@/state/use-service-query';
import {
  AppText,
  EmptyState,
  Header,
  IconButton,
  MessageBubble,
  Screen,
  Spacing,
  useAppTheme,
} from '@/ui';

interface ThreadData {
  messages: Message[];
  selfAddress: string;
  subject: string;
}

const INITIAL: ThreadData = { messages: [], selfAddress: '', subject: '' };

export default function ThreadScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useAppTheme();
  const { service, invalidate } = useApp();
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);

  const { data, reload } = useServiceQuery<ThreadData>(async (mailService) => {
    const messages = await mailService.openThread(id);
    const account = messages[0] ? await mailService.getAccountById(messages[0].accountId) : null;
    return {
      messages,
      selfAddress: account?.emailAddress ?? '',
      subject: messages[0]?.subject ?? '',
    };
  }, INITIAL);

  const goBack = useCallback(() => {
    invalidate();
    router.back();
  }, [invalidate]);

  // Answer the last message that is not ours, so a follow-up after our own
  // reply still targets the correspondent.
  const replyTarget = useMemo<Message | undefined>(() => {
    const self = data.selfAddress.toLowerCase();
    for (let index = data.messages.length - 1; index >= 0; index -= 1) {
      if (data.messages[index].senderAddress.toLowerCase() !== self) {
        return data.messages[index];
      }
    }
    return data.messages[data.messages.length - 1];
  }, [data.messages, data.selfAddress]);

  const onSend = useCallback(async () => {
    const body = draft.trim();
    if (body.length === 0 || !replyTarget) {
      return;
    }
    setSending(true);
    try {
      await service.send({
        accountId: replyTarget.accountId,
        to: '',
        subject: '',
        body,
        replyToMessageId: replyTarget.id,
        mode: 'reply',
      });
      setDraft('');
      await reload();
      invalidate();
    } finally {
      setSending(false);
    }
  }, [draft, replyTarget, service, reload, invalidate]);

  const onArchive = useCallback(async () => {
    await service.archiveThread(id);
    invalidate();
    router.back();
  }, [service, id, invalidate]);

  const onDelete = useCallback(async () => {
    await service.deleteThread(id);
    invalidate();
    router.back();
  }, [service, id, invalidate]);

  const onToggleStar = useCallback(async () => {
    if (!replyTarget) {
      return;
    }
    await service.toggleStar(replyTarget.id, !replyTarget.isStarred);
    await reload();
    invalidate();
  }, [replyTarget, service, reload, invalidate]);

  const renderItem: ListRenderItem<Message> = useCallback(
    ({ item }) => (
      <MessageBubble
        message={item}
        isOwn={item.senderAddress.toLowerCase() === data.selfAddress.toLowerCase()}
        showSender
      />
    ),
    [data.selfAddress],
  );

  return (
    <Screen edges={['top']}>
      <Header
        title={data.subject || '(Sans objet)'}
        subtitle={`${data.messages.length} message${data.messages.length > 1 ? 's' : ''}`}
        onBack={goBack}
        right={
          <View style={styles.actions}>
            <IconButton
              icon={replyTarget?.isStarred ? 'star.fill' : 'star'}
              accessibilityLabel="Marquer comme important"
              color={replyTarget?.isStarred ? theme.warning : undefined}
              onPress={onToggleStar}
              testID="thread-star"
            />
            <IconButton
              icon="archivebox"
              accessibilityLabel="Archiver"
              onPress={onArchive}
              testID="thread-archive"
            />
            <IconButton
              icon="trash"
              accessibilityLabel="Supprimer"
              onPress={onDelete}
              testID="thread-delete"
            />
          </View>
        }
      />

      <FlatList
        data={data.messages}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <EmptyState title="Conversation vide" description="Aucun message dans ce fil." />
        }
      />

      <View style={[styles.composer, { borderTopColor: theme.border }]}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder="Écrire un message…"
          placeholderTextColor={theme.textMuted}
          style={[
            styles.input,
            { color: theme.text, backgroundColor: theme.surfaceAlt, borderColor: theme.border },
          ]}
          multiline
          testID="thread-input"
        />
        {sending ? (
          <AppText variant="caption" color="textMuted">
            Envoi…
          </AppText>
        ) : (
          <IconButton
            icon="paperplane.fill"
            accessibilityLabel="Envoyer"
            color={theme.primary}
            onPress={onSend}
            testID="thread-send"
          />
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  list: {
    paddingVertical: Spacing.md,
    gap: Spacing.sm,
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: Spacing.sm,
  },
  input: {
    flex: 1,
    maxHeight: 120,
    minHeight: 40,
    borderWidth: 1,
    borderRadius: Spacing.xl,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
});
