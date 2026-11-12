import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { mailbox, type MailboxId } from '@/domain/mailboxes';
import type { ThreadSummary } from '@/domain/models';
import { AppDrawer } from '@/screens/AppDrawer';
import { useApp } from '@/state/app-context';
import { usePermissions } from '@/state/use-permissions';
import { useServiceQuery } from '@/state/use-service-query';
import { AppBar, ConversationRow, EmptyState, Fab, useAppTheme } from '@/ui';

interface MailboxData {
  threads: ThreadSummary[];
  self: string[];
  now: number;
}

const EMPTY: MailboxData = { threads: [], self: [], now: 0 };

/** One drawer mailbox (category or folder) as a plain, Gmail-like list. */
export default function MailboxScreen() {
  const colors = useAppTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const box = mailbox(id);
  const { service, refresh, sync } = useApp();
  const insets = useSafeAreaInsets();
  const [drawer, setDrawer] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const { missingVital } = usePermissions(service.getSettings().realtimeMode === 'idle');

  const { data, loading } = useServiceQuery<MailboxData>(
    async (mailService) => ({
      threads: await mailService.listMailbox(box.id as MailboxId),
      self: (await mailService.listAccounts()).map((a) => a.emailAddress.toLowerCase()),
      now: Date.now(),
    }),
    EMPTY,
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  }, [refresh]);

  return (
    <SafeAreaView edges={['top']} style={[styles.screen, { backgroundColor: colors.background }]}>
      <AppBar
        title={box.label}
        subtitle={
          data.threads.length > 0
            ? `${data.threads.length} conversation${data.threads.length > 1 ? 's' : ''}`
            : undefined
        }
        onBack={() => router.back()}
        actions={[
          {
            icon: 'menu',
            label: 'Boîtes et catégories',
            onPress: () => setDrawer(true),
            alert: missingVital,
            testID: 'mailbox-menu',
          },
        ]}
      />
      <FlatList
        data={data.threads}
        keyExtractor={(thread) => thread.id}
        renderItem={({ item }) => (
          <ConversationRow
            thread={item}
            now={data.now}
            isOwnLast={data.self.includes(item.lastMessage.senderAddress.toLowerCase())}
            photoUri={service.getContactPhoto(item.contact.address)}
            onPress={() =>
              router.push({
                pathname: '/thread/[id]',
                params: {
                  id: item.id,
                  name: item.contact.name || item.contact.address,
                  address: item.contact.address,
                },
              })
            }
            testID={`mailbox-row-${item.id}`}
          />
        )}
        ListEmptyComponent={
          loading ? null : (
            <EmptyState
              icon={box.icon}
              title={`Rien dans « ${box.label} »`}
              description="Les conversations de cette boîte apparaîtront ici."
            />
          )
        }
        contentContainerStyle={
          data.threads.length === 0 ? styles.emptyList : { paddingBottom: insets.bottom + 96 }
        }
        refreshControl={
          <RefreshControl
            refreshing={refreshing && !sync}
            onRefresh={onRefresh}
            colors={[colors.primary]}
          />
        }
      />
      <Fab
        bottomInset={insets.bottom}
        icon="edit"
        accessibilityLabel="Nouveau message"
        onPress={() => router.push('/compose')}
      />
      <AppDrawer
        visible={drawer}
        onClose={() => setDrawer(false)}
        current={box.id}
        permissionAlert={missingVital}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  emptyList: { flexGrow: 1 },
});
