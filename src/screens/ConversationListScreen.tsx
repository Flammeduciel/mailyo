/**
 * Conversation list shared by the bottom tabs (Discussions, Actus, Groupes,
 * Favoris) and the archived screen: app bar with overflow menu, search pill,
 * filter chips, long-press multi-selection with a contextual action bar,
 * infinite scroll (local pages first, then older mail from the provider) and a
 * compose FAB.
 */

import { MaterialIcons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { firstToOpen, groupThreadsByContact, type ContactGroup } from '@/domain/grouping';
import type { ConversationCounts } from '@/data/repositories/threads';
import type { ConversationFilter, ConversationTab, ThreadSummary } from '@/domain/models';
import { useApp } from '@/state/app-context';
import { useServiceQuery } from '@/state/use-service-query';
import {
  AppBar,
  AppText,
  Button,
  ConversationRow,
  EmptyState,
  Fab,
  FilterChips,
  PopupMenu,
  SearchPill,
  SyncRing,
  Spacing,
  useAppTheme,
  type AppBarAction,
  type FilterChipOption,
} from '@/ui';

const PAGE_SIZE = 30;

export interface ConversationListScreenProps {
  /** Bottom tab; omitted for the archived list. */
  tab?: ConversationTab;
  archived?: boolean;
  title: string;
}

interface ListData {
  threads: ThreadSummary[];
  counts: ConversationCounts;
  unread: number;
  archivedCount: number;
  selfAddresses: string[];
  now: number;
}

const INITIAL: ListData = {
  threads: [],
  counts: { all: 0, unread: 0, attachments: 0, spam: 0 },
  unread: 0,
  archivedCount: 0,
  selfAddresses: [],
  now: 0,
};

const EMPTY_COPY: Record<string, { title: string; description: string }> = {
  discussions: {
    title: 'Aucune discussion',
    description: 'Vos échanges avec de vraies personnes apparaîtront ici.',
  },
  actus: {
    title: 'Aucune actu',
    description: 'Newsletters, promotions, notifications et réseaux sociaux arrivent ici.',
  },
  groupes: {
    title: 'Aucun groupe',
    description: 'Les listes de diffusion et forums auxquels vous êtes inscrit arrivent ici.',
  },
  favoris: {
    title: 'Aucun favori',
    description: 'Maintenez une conversation appuyée puis touchez l’étoile pour la retrouver ici.',
  },
  archived: {
    title: 'Aucune discussion archivée',
    description: 'Les conversations archivées sont rangées ici.',
  },
};

export function ConversationListScreen({
  tab,
  archived = false,
  title,
}: ConversationListScreenProps) {
  const colors = useAppTheme();
  const { service, refresh, invalidate, sync } = useApp();
  const [filter, setFilter] = useState<ConversationFilter>('all');
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const exhausted = useRef(false);

  const { data, reload } = useServiceQuery<ListData>(async (mailService) => {
    const [threads, counts, archivedThreads, accounts] = await Promise.all([
      mailService.listConversations({ tab, filter, archivedOnly: archived, limit }),
      mailService.conversationCounts({ tab, archivedOnly: archived }),
      tab === 'discussions'
        ? mailService.listConversations({ archivedOnly: true })
        : Promise.resolve([]),
      mailService.listAccounts(),
    ]);
    return {
      threads,
      counts,
      unread: counts.unread,
      archivedCount: archivedThreads.length,
      selfAddresses: accounts.map((account) => account.emailAddress.toLowerCase()),
      now: Date.now(),
    };
  }, INITIAL);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  // A new page size or filter needs a reload; the loader reads them through a
  // ref updated after render, hence an effect rather than a direct call.
  const firstRun = useRef(true);
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    void reload();
  }, [limit, filter, reload]);

  // Changing filter restarts from the first page.
  const onFilterChange = useCallback((next: ConversationFilter) => {
    setFilter(next);
    setLimit(PAGE_SIZE);
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    exhausted.current = false;
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  }, [refresh]);

  /** Infinite scroll: grow the local page, then pull older mail from the server. */
  const onEndReached = useCallback(async () => {
    if (loadingMore || refreshing) {
      return;
    }
    if (data.threads.length >= limit) {
      setLimit((value) => value + PAGE_SIZE);
      return;
    }
    if (exhausted.current || archived) {
      return;
    }
    setLoadingMore(true);
    try {
      const more = await service.loadOlderConversations(PAGE_SIZE);
      exhausted.current = !more;
      setLimit((value) => value + PAGE_SIZE);
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, refreshing, data.threads.length, limit, archived, service]);

  // ---------------------------------------------------------------- selection

  const selecting = selected.size > 0;
  const toggleSelected = useCallback((id: string) => {
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);
  const clearSelection = useCallback(() => setSelected(new Set()), []);

  // One row per person: a row stands for every conversation with them.
  const groups = useMemo(() => groupThreadsByContact(data.threads), [data.threads]);
  const selectedThreads = useMemo(
    () => groups.filter((group) => selected.has(group.key)).flatMap((group) => group.threads),
    [groups, selected],
  );

  const openGroup = useCallback(
    (group: ContactGroup) => {
      // Something unread, or a single subject: straight into that conversation.
      // The subject list only shows when everything has been read.
      if (group.threads.length === 1 || group.unreadCount > 0) {
        router.push(`/thread/${firstToOpen(group).id}`);
        return;
      }
      router.push({
        pathname: '/contact/[address]',
        params: {
          address: group.lead.contact.address,
          tab: tab ?? '',
          archived: archived ? '1' : '',
        },
      });
    },
    [tab, archived],
  );

  const runOnSelection = useCallback(
    async (action: (thread: ThreadSummary) => Promise<void>) => {
      for (const thread of selectedThreads) {
        await action(thread);
      }
      clearSelection();
      invalidate();
    },
    [selectedThreads, clearSelection, invalidate],
  );

  const allPinned = selectedThreads.length > 0 && selectedThreads.every((t) => t.isPinned);
  const allStarred = selectedThreads.length > 0 && selectedThreads.every((t) => t.isStarred);
  const anyUnread = selectedThreads.some((t) => t.unreadCount > 0);
  const allSpam = selectedThreads.length > 0 && selectedThreads.every((t) => t.isSpam);

  const selectionActions: AppBarAction[] = [
    {
      icon: 'push-pin',
      label: allPinned ? 'Désépingler' : 'Épingler',
      onPress: () => void runOnSelection((t) => service.setThreadPinned(t.id, !allPinned)),
      testID: 'selection-pin',
    },
    {
      icon: allStarred ? 'star' : 'star-border',
      label: allStarred ? 'Retirer des favoris' : 'Ajouter aux favoris',
      onPress: () => void runOnSelection((t) => service.setThreadStarred(t.id, !allStarred)),
      testID: 'selection-star',
    },
    {
      icon: archived ? 'unarchive' : 'archive',
      label: archived ? 'Désarchiver' : 'Archiver',
      onPress: () =>
        void runOnSelection((t) =>
          archived ? service.unarchiveThread(t.id) : service.archiveThread(t.id),
        ),
      testID: 'selection-archive',
    },
    {
      icon: 'delete-outline',
      label: 'Supprimer',
      onPress: () =>
        Alert.alert(
          `Supprimer ${selectedThreads.length} conversation${selectedThreads.length > 1 ? 's' : ''} ?`,
          'Les emails seront placés dans la corbeille.',
          [
            { text: 'Annuler', style: 'cancel' },
            {
              text: 'Supprimer',
              style: 'destructive',
              onPress: () => void runOnSelection((t) => service.deleteThread(t.id)),
            },
          ],
        ),
      testID: 'selection-delete',
    },
    {
      icon: allSpam ? 'report-off' : 'report',
      label: allSpam ? 'Ce n’est pas du spam' : 'Signaler comme spam',
      onPress: () => void runOnSelection((t) => service.setThreadSpam(t.id, !allSpam)),
      testID: 'selection-spam',
    },
    {
      icon: anyUnread ? 'mark-email-read' : 'mark-email-unread',
      label: anyUnread ? 'Marquer comme lu' : 'Marquer comme non lu',
      onPress: () => void runOnSelection((t) => service.markThreadRead(t.id, anyUnread)),
      testID: 'selection-read',
    },
  ];

  // ------------------------------------------------------------------ chrome

  const menuItems = [
    { label: 'Nouveau message', onPress: () => router.push('/compose') },
    { label: 'Ajouter un compte', onPress: () => router.push('/login') },
    { label: 'Discussions archivées', onPress: () => router.push('/archived') },
    {
      label: 'Tout marquer comme lu',
      onPress: () =>
        void (async () => {
          for (const thread of await service.listConversations({ tab, filter: 'unread' })) {
            await service.markThreadRead(thread.id, true);
          }
          invalidate();
        })(),
    },
    { label: 'Paramètres', onPress: () => router.push('/settings') },
  ];

  const chips: FilterChipOption<ConversationFilter>[] = [
    { value: 'all', label: 'Toutes', count: data.counts.all || undefined },
    {
      value: 'unread',
      label: 'Non lus',
      icon: 'mark-email-unread',
      count: data.counts.unread || undefined,
    },
    {
      value: 'attachments',
      label: 'Pièces jointes',
      icon: 'attach-file',
      count: data.counts.attachments || undefined,
    },
    { value: 'spam', label: 'Spam', icon: 'report', count: data.counts.spam || undefined },
  ];

  const empty = EMPTY_COPY[archived ? 'archived' : (tab ?? 'discussions')];

  return (
    <SafeAreaView edges={['top']} style={[styles.screen, { backgroundColor: colors.background }]}>
      {selecting ? (
        <AppBar title={String(selected.size)} onBack={clearSelection} actions={selectionActions} />
      ) : (
        <AppBar
          title={title}
          variant={tab === 'discussions' ? 'brand' : 'regular'}
          onBack={archived ? () => router.back() : undefined}
          actions={[
            ...(archived
              ? []
              : [
                  {
                    icon: 'refresh',
                    label: 'Actualiser',
                    onPress: () => void onRefresh(),
                    testID: 'list-refresh',
                  },
                ]),
            {
              icon: 'more-vert',
              label: 'Plus d’options',
              onPress: () => setMenuOpen(true),
              testID: 'list-menu',
            },
          ]}
        />
      )}

      <FlatList
        data={groups}
        keyExtractor={(item) => item.key}
        ListHeaderComponent={
          <View>
            {sync && groups.length > 0 && !archived ? (
              <View style={[styles.syncBar, { backgroundColor: colors.primaryContainer }]}>
                <SyncRing ratio={sync.ratio} size={30} strokeWidth={3} showLabel={false} />
                <AppText variant="caption" weight="semibold" style={styles.syncText}>
                  Récupération de vos emails…
                  {sync.stored > 0 ? ` ${sync.stored} reçus` : ''}
                </AppText>
                <AppText variant="caption" weight="semibold" style={{ color: colors.primary }}>
                  {Math.round(sync.ratio * 100)} %
                </AppText>
              </View>
            ) : null}
            {archived ? null : (
              <SearchPill onPress={() => router.push('/search')} testID="list-search" />
            )}
            <FilterChips options={chips} value={filter} onChange={onFilterChange} />
            {tab === 'discussions' && data.archivedCount > 0 && filter === 'all' ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push('/archived')}
                style={({ pressed }) => [
                  styles.archivedRow,
                  pressed && { backgroundColor: colors.surfaceAlt },
                ]}
                testID="list-archived"
              >
                <View style={styles.archivedIcon}>
                  <MaterialIcons name="archive" size={22} color={colors.textSecondary} />
                </View>
                <AppText weight="semibold" style={styles.archivedLabel}>
                  Archivées
                </AppText>
                <AppText variant="caption" style={{ color: colors.primary }}>
                  {data.archivedCount}
                </AppText>
              </Pressable>
            ) : null}
          </View>
        }
        renderItem={({ item }) => {
          const lead = item.lead;
          const isOwnLast = data.selfAddresses.includes(
            lead.lastMessage.senderAddress.toLowerCase(),
          );
          return (
            <ConversationRow
              thread={{
                ...lead,
                unreadCount: item.unreadCount,
                isPinned: item.isPinned,
                isStarred: item.isStarred,
                hasAttachments: item.hasAttachments,
                isSpam: item.threads.some((t) => t.isSpam),
              }}
              subjectCount={item.threads.length}
              now={data.now}
              isOwnLast={isOwnLast}
              selected={selected.has(item.key)}
              photoUri={service.getContactPhoto(lead.contact.address)}
              onPress={() => (selecting ? toggleSelected(item.key) : openGroup(item))}
              onLongPress={() => toggleSelected(item.key)}
              testID={`conversation-${lead.id}`}
            />
          );
        }}
        onEndReached={() => void onEndReached()}
        onEndReachedThreshold={0.6}
        ListFooterComponent={
          loadingMore ? (
            <ActivityIndicator style={styles.footer} color={colors.primary} />
          ) : (
            <View style={styles.fabSpacer} />
          )
        }
        ListEmptyComponent={
          sync && !archived ? (
            <View style={styles.syncEmpty} testID="list-syncing">
              <SyncRing ratio={sync.ratio} size={96} strokeWidth={7} />
              <AppText variant="subtitle" weight="semibold">
                Récupération de vos emails…
              </AppText>
              <AppText variant="body" color="textSecondary" style={styles.syncHint}>
                Vos conversations apparaissent au fur et à mesure.
              </AppText>
            </View>
          ) : (
            <EmptyState
              icon={archived ? 'archive' : 'forum'}
              title={empty.title}
              description={empty.description}
              action={
                data.selfAddresses.length === 0 ? (
                  <Button
                    label="Ajouter un compte"
                    variant="secondary"
                    onPress={() => router.push('/login')}
                  />
                ) : undefined
              }
            />
          )
        }
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />
        }
      />

      {selecting || archived ? null : (
        <Fab
          icon="edit"
          accessibilityLabel="Nouveau message"
          onPress={() => router.push('/compose')}
          testID="list-compose"
        />
      )}

      <PopupMenu visible={menuOpen} items={menuItems} onClose={() => setMenuOpen(false)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  syncBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: 24,
  },
  syncText: {
    flex: 1,
  },
  syncEmpty: {
    alignItems: 'center',
    gap: Spacing.md,
    paddingTop: 96,
    paddingHorizontal: Spacing.xl,
  },
  syncHint: {
    textAlign: 'center',
  },
  archivedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.lg,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  archivedIcon: {
    width: 52,
    alignItems: 'center',
  },
  archivedLabel: {
    flex: 1,
  },
  footer: {
    paddingVertical: Spacing.lg,
  },
  fabSpacer: {
    height: 88,
  },
});
