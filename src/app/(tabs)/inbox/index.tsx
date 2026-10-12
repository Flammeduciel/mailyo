import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';

import type { ThreadSummary } from '@/domain/models';
import { useApp } from '@/state/app-context';
import { useServiceQuery } from '@/state/use-service-query';
import {
  Button,
  ConversationRow,
  Divider,
  EmptyState,
  Header,
  IconButton,
  Screen,
  Spacing,
} from '@/ui';

interface InboxData {
  threads: ThreadSummary[];
  unread: number;
  now: number;
}

const INITIAL: InboxData = { threads: [], unread: 0, now: 0 };

export default function InboxScreen() {
  const { refresh } = useApp();
  const [refreshing, setRefreshing] = useState(false);

  const { data, reload } = useServiceQuery<InboxData>(async (service) => {
    const [threads, unread] = await Promise.all([
      service.listConversations(),
      service.unreadCount(),
    ]);
    return { threads, unread, now: Date.now() };
  }, INITIAL);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  }, [refresh]);

  const openThread = useCallback((id: string) => {
    router.push(`/thread/${id}`);
  }, []);

  return (
    <Screen>
      <Header
        title="Messages"
        subtitle={data.unread > 0 ? `${data.unread} non lus` : undefined}
        right={
          <View style={styles.actions}>
            <IconButton
              icon="magnifyingglass"
              accessibilityLabel="Rechercher"
              onPress={() => router.push('/search')}
              testID="inbox-search"
            />
            <IconButton
              icon="square.and.pencil"
              accessibilityLabel="Nouveau message"
              onPress={() => router.push('/compose')}
              testID="inbox-compose"
            />
          </View>
        }
      />

      <FlatList
        data={data.threads}
        keyExtractor={(item) => item.id}
        contentContainerStyle={data.threads.length === 0 ? styles.grow : undefined}
        renderItem={({ item }) => (
          <ConversationRow
            thread={item}
            now={data.now}
            onPress={() => openThread(item.id)}
            testID={`conversation-${item.id}`}
          />
        )}
        ItemSeparatorComponent={() => <Divider inset={Spacing.lg + 44 + Spacing.md} />}
        ListEmptyComponent={
          <EmptyState
            icon="tray"
            title="Aucune conversation"
            description="Ajoutez un compte ou envoyez un message pour commencer."
            action={
              <Button
                label="Ajouter un compte"
                variant="secondary"
                onPress={() => router.push('/login')}
              />
            }
          />
        }
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  grow: {
    flexGrow: 1,
  },
});
