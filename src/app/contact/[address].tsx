import { MaterialIcons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { ConversationTab, ThreadSummary } from '@/domain/models';
import { useApp } from '@/state/app-context';
import { useServiceQuery } from '@/state/use-service-query';
import {
  AppBar,
  AppText,
  Avatar,
  Badge,
  Divider,
  EmptyState,
  formatThreadTime,
  IconButton,
  previewText,
  Spacing,
  useAppTheme,
  showAlert,
} from '@/ui';

interface Data {
  threads: ThreadSummary[];
  now: number;
}

/**
 * Every conversation (subject) with one person, newest first; unread ones
 * stand out. Reached from a grouped row of the conversation list.
 */
export default function ContactSubjectsScreen() {
  const { address, tab, archived } = useLocalSearchParams<{
    address: string;
    tab?: string;
    archived?: string;
  }>();
  const colors = useAppTheme();
  const { service, invalidate } = useApp();
  const key = (address ?? '').toLowerCase();

  const { data, reload } = useServiceQuery<Data>(
    async (mailService) => {
      const all = await mailService.listConversations({
        tab: (tab || undefined) as ConversationTab | undefined,
        archivedOnly: archived === '1',
      });
      const threads = all
        .filter((thread) => thread.contact.address.toLowerCase() === key)
        .sort((a, b) => b.lastMessage.receivedAt - a.lastMessage.receivedAt);
      return { threads, now: Date.now() };
    },
    { threads: [], now: 0 },
  );

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  const name = data.threads[0]?.contact.name || address || '';

  // Delete one subject without opening it; leave when none is left.
  const confirmDelete = (thread: ThreadSummary) =>
    showAlert(
      'Supprimer la conversation ?',
      `« ${thread.lastMessage.subject || 'Sans objet'} » ira dans la corbeille.`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: () =>
            void (async () => {
              await service.deleteThread(thread.id);
              invalidate();
              if (data.threads.length <= 1) router.back();
              else await reload();
            })(),
        },
      ],
    );
  const unread = data.threads.filter((t) => t.unreadCount > 0).length;

  return (
    <SafeAreaView edges={['top']} style={[styles.screen, { backgroundColor: colors.background }]}>
      <AppBar
        title={name}
        subtitle={`${data.threads.length} sujets${unread > 0 ? ` · ${unread} non lu${unread > 1 ? 's' : ''}` : ''}`}
        onBack={() => router.back()}
        leading={<Avatar name={name} size={38} imageUri={service.getContactPhoto(address)} />}
      />
      <FlatList
        data={data.threads}
        keyExtractor={(item) => item.id}
        ItemSeparatorComponent={() => <Divider inset={Spacing.lg + 40 + Spacing.md} />}
        renderItem={({ item }) => {
          const isUnread = item.unreadCount > 0;
          const preview = previewText(item.lastMessage.bodyText);
          return (
            <Pressable
              onPress={() => router.push(`/thread/${item.id}`)}
              onLongPress={() => confirmDelete(item)}
              style={({ pressed }) => [
                styles.row,
                { backgroundColor: pressed ? colors.surfaceAlt : colors.background },
              ]}
              testID={`subject-${item.id}`}
            >
              <View
                style={[
                  styles.icon,
                  { backgroundColor: isUnread ? colors.primary : colors.primaryContainer },
                ]}
              >
                <MaterialIcons
                  name={isUnread ? 'mark-chat-unread' : 'chat-bubble-outline'}
                  size={20}
                  color={isUnread ? colors.onPrimary : colors.primary}
                />
              </View>
              <View style={styles.content}>
                <View style={styles.line}>
                  <AppText
                    weight={isUnread ? 'bold' : 'semibold'}
                    numberOfLines={1}
                    style={styles.subject}
                  >
                    {item.lastMessage.subject || 'Sans objet'}
                  </AppText>
                  <AppText
                    variant="caption"
                    style={{ color: isUnread ? colors.primary : colors.textMuted }}
                  >
                    {formatThreadTime(item.lastMessage.receivedAt, data.now)}
                  </AppText>
                </View>
                <View style={styles.line}>
                  {item.hasAttachments ? (
                    <MaterialIcons name="attach-file" size={15} color={colors.textMuted} />
                  ) : null}
                  <AppText
                    variant="caption"
                    color={isUnread ? 'text' : 'textSecondary'}
                    numberOfLines={1}
                    style={styles.preview}
                  >
                    {item.messageCount} message{item.messageCount > 1 ? 's' : ''}
                    {preview ? ` · ${preview}` : ''}
                  </AppText>
                  <Badge count={item.unreadCount} />
                </View>
              </View>
              <IconButton
                icon="delete-outline"
                accessibilityLabel={`Supprimer « ${item.lastMessage.subject || 'Sans objet'} »`}
                onPress={() => confirmDelete(item)}
                size={22}
                color={colors.textMuted}
                testID={`subject-delete-${item.id}`}
              />
            </Pressable>
          );
        }}
        ListEmptyComponent={<EmptyState icon="forum" title="Aucune conversation" />}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingLeft: Spacing.lg,
    paddingRight: Spacing.xs,
    paddingVertical: Spacing.md,
  },
  icon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: { flex: 1, gap: 2 },
  line: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  subject: { flex: 1 },
  preview: { flex: 1 },
});
