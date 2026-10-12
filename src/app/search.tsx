import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';

import type { Message } from '@/domain/models';
import { useApp } from '@/state/app-context';
import {
  AppText,
  Avatar,
  Divider,
  EmptyState,
  Header,
  Screen,
  Spacing,
  TextField,
  useAppTheme,
} from '@/ui';

export default function SearchScreen() {
  const theme = useAppTheme();
  const { service } = useApp();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Message[]>([]);
  const [searched, setSearched] = useState(false);

  const trimmed = query.trim();

  useEffect(() => {
    if (query.trim().length === 0) {
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      const hits = await service.search(query.trim());
      if (!cancelled) {
        setResults(hits);
        setSearched(true);
      }
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, service]);

  const visibleResults = query.trim().length === 0 ? [] : results;

  return (
    <Screen>
      <Header title="Recherche" onBack={() => router.back()} />
      <View style={styles.field}>
        <TextField
          value={query}
          onChangeText={setQuery}
          placeholder="Rechercher un message, un expéditeur…"
          autoCapitalize="none"
          testID="search-input"
        />
      </View>

      <FlatList
        data={visibleResults}
        keyExtractor={(item) => item.id}
        contentContainerStyle={visibleResults.length === 0 ? styles.grow : undefined}
        ItemSeparatorComponent={() => <Divider inset={Spacing.lg + 40 + Spacing.md} />}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push(`/thread/${item.threadId}`)}
            style={({ pressed }) => [
              styles.row,
              { backgroundColor: pressed ? theme.surfaceAlt : theme.background },
            ]}
            testID={`search-result-${item.id}`}
          >
            <Avatar name={item.senderName || item.senderAddress} size={40} />
            <View style={styles.content}>
              <AppText variant="body" weight="semibold" numberOfLines={1}>
                {item.subject || '(Sans objet)'}
              </AppText>
              <AppText variant="caption" color="textSecondary" numberOfLines={1}>
                {item.senderName || item.senderAddress}
              </AppText>
              <AppText variant="caption" color="textMuted" numberOfLines={1}>
                {item.bodyText}
              </AppText>
            </View>
          </Pressable>
        )}
        ListEmptyComponent={
          trimmed.length > 0 && searched ? (
            <EmptyState icon="magnifyingglass" title="Aucun résultat" />
          ) : (
            <EmptyState
              icon="magnifyingglass"
              title="Rechercher dans vos messages"
              description="Objet, expéditeur ou contenu."
            />
          )
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  field: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  grow: {
    flexGrow: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  content: {
    flex: 1,
    gap: Spacing.xs,
  },
});
