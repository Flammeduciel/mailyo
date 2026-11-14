/**
 * « Corbeille »: mail deleted from Wouah Mail (or elsewhere) is still in the
 * provider's trash for about 30 days. Read live from the server, one tap
 * puts it back in its conversation.
 */

import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { TrashedMail } from '@/services/mail-service';
import { useApp } from '@/state/app-context';
import { AppBar, AppText, Avatar, EmptyState, Radius, Spacing, useAppTheme } from '@/ui';

function formatDate(ms: number): string {
  const date = new Date(ms);
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
}

const keyOf = (item: TrashedMail) => `${item.accountId}:${item.remote.remoteUid}`;

export default function TrashScreen() {
  const colors = useAppTheme();
  const { service, refresh, invalidate } = useApp();
  const [items, setItems] = useState<TrashedMail[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [restored, setRestored] = useState(0);

  const fetchTrash = useCallback(
    () =>
      service.listTrash().then(setItems, (cause: unknown) => {
        setError(cause instanceof Error ? cause.message : String(cause));
        setItems([]);
      }),
    [service],
  );

  const load = useCallback(() => {
    setError(null);
    setItems(null);
    void fetchTrash();
  }, [fetchTrash]);

  useEffect(() => {
    void fetchTrash();
  }, [fetchTrash]);

  const restore = useCallback(
    async (item: TrashedMail) => {
      const key = keyOf(item);
      setBusy(key);
      try {
        await service.restoreFromTrash(item);
        setItems((current) => current?.filter((other) => keyOf(other) !== key) ?? null);
        setRestored((count) => count + 1);
        invalidate();
        // IMAP: the restored mail comes back with the next sync.
        void refresh();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
      } finally {
        setBusy(null);
      }
    },
    [service, invalidate, refresh],
  );

  const multipleAccounts = new Set(items?.map((item) => item.accountId)).size > 1;

  return (
    <SafeAreaView
      edges={['top', 'bottom']}
      style={[styles.screen, { backgroundColor: colors.background }]}
    >
      <AppBar
        title="Corbeille"
        subtitle={items && items.length > 0 ? `${items.length} mail(s) supprimé(s)` : undefined}
        onBack={() => router.back()}
        actions={[{ icon: 'refresh', label: 'Actualiser', onPress: load }]}
      />
      <View style={[styles.notice, { backgroundColor: colors.surfaceAlt }]}>
        <MaterialIcons name="info-outline" size={18} color={colors.textSecondary} />
        <AppText variant="caption" color="textSecondary" style={styles.noticeText}>
          {restored > 0
            ? `${restored} mail(s) restauré(s) : ils sont de retour dans leurs conversations.`
            : 'Les mails supprimés restent environ 30 jours dans la corbeille de votre messagerie, puis sont effacés.'}
        </AppText>
      </View>
      {error ? (
        <AppText variant="caption" style={[styles.error, { color: colors.danger }]}>
          {error}
        </AppText>
      ) : null}
      {items === null ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={keyOf}
          contentContainerStyle={items.length === 0 ? styles.emptyContainer : undefined}
          ListEmptyComponent={
            <EmptyState
              icon="delete-outline"
              title="La corbeille est vide"
              description="Les mails que vous supprimez apparaissent ici et peuvent être restaurés."
            />
          }
          renderItem={({ item }) => {
            const key = keyOf(item);
            const preview = item.remote.bodyText.replace(/\s+/g, ' ').trim();
            return (
              <View style={styles.row} testID={`trash-${key}`}>
                <Avatar
                  name={item.senderDisplayName}
                  size={46}
                  imageUri={service.getContactPhoto(item.remote.senderAddress)}
                />
                <View style={styles.text}>
                  <View style={styles.line}>
                    <AppText weight="semibold" numberOfLines={1} style={styles.name}>
                      {item.senderDisplayName}
                    </AppText>
                    <AppText variant="caption" color="textSecondary">
                      {formatDate(item.remote.receivedAt)}
                    </AppText>
                  </View>
                  <AppText numberOfLines={1}>{item.remote.subject || 'Sans objet'}</AppText>
                  <AppText variant="caption" color="textSecondary" numberOfLines={1}>
                    {multipleAccounts ? `${item.accountAddress} · ` : ''}
                    {preview}
                  </AppText>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Restaurer"
                  disabled={busy !== null}
                  onPress={() => void restore(item)}
                  style={({ pressed }) => [
                    styles.restore,
                    { backgroundColor: pressed ? colors.primaryContainer : colors.chip },
                  ]}
                  testID={`trash-restore-${key}`}
                >
                  {busy === key ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : (
                    <>
                      <MaterialIcons name="restore-from-trash" size={18} color={colors.primary} />
                      <AppText
                        variant="caption"
                        weight="semibold"
                        style={{ color: colors.primary }}
                      >
                        Restaurer
                      </AppText>
                    </>
                  )}
                </Pressable>
              </View>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
    padding: Spacing.md,
    borderRadius: Radius.md,
  },
  noticeText: { flex: 1 },
  error: { marginHorizontal: Spacing.lg, marginBottom: Spacing.sm },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyContainer: { flexGrow: 1, justifyContent: 'center' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  text: { flex: 1, minWidth: 0 },
  line: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  name: { flex: 1 },
  restore: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.pill,
    minWidth: 104,
    justifyContent: 'center',
  },
});
