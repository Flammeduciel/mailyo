import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';

import { attachmentKind } from '@/domain/attachments';
import type { Message } from '@/domain/models';
import type { FileSearchHit } from '@/services/mail-service';
import { useApp } from '@/state/app-context';
import { useAttachmentActions } from '@/state/use-attachment-actions';
import {
  AppText,
  AttachmentList,
  Avatar,
  Divider,
  EmptyState,
  FilterChips,
  Header,
  Screen,
  Spacing,
  TextField,
  useAppTheme,
} from '@/ui';

type Scope = 'messages' | 'files' | 'media' | 'pdf';

const SCOPES: { value: Scope; label: string }[] = [
  { value: 'messages', label: 'Messages' },
  { value: 'files', label: 'Fichiers' },
  { value: 'media', label: 'Photos et vidéos' },
  { value: 'pdf', label: 'PDF' },
];

function inScope(scope: Scope, hit: FileSearchHit): boolean {
  const kind = attachmentKind(hit.attachment.mimeType, hit.attachment.filename);
  if (scope === 'media') return kind === 'image' || kind === 'video';
  if (scope === 'pdf') return kind === 'pdf';
  return true;
}

export default function SearchScreen() {
  const theme = useAppTheme();
  const { service } = useApp();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Message[]>([]);
  const [searched, setSearched] = useState(false);
  const [scope, setScope] = useState<Scope>('messages');
  const [files, setFiles] = useState<FileSearchHit[]>([]);
  const actions = useAttachmentActions();

  const trimmed = query.trim();

  useEffect(() => {
    if (query.trim().length === 0) {
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      const [hits, fileHits] = await Promise.all([
        service.search(query.trim()),
        service.searchFiles(query.trim()),
      ]);
      if (!cancelled) {
        setResults(hits);
        setFiles(fileHits);
        setSearched(true);
      }
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, service]);

  const visibleResults = query.trim().length === 0 ? [] : results;
  const visibleFiles = query.trim().length === 0 ? [] : files.filter((hit) => inScope(scope, hit));
  const emptyState =
    trimmed.length > 0 && searched ? (
      <EmptyState icon="search" title="Aucun résultat" />
    ) : (
      <EmptyState
        icon="search"
        title="Rechercher dans vos messages"
        description="Objet, expéditeur, contenu ou nom de fichier."
      />
    );

  return (
    <Screen>
      <Header title="Recherche" onBack={() => router.back()} />
      <View style={styles.field}>
        <TextField
          value={query}
          onChangeText={setQuery}
          placeholder="Message, expéditeur, nom de fichier…"
          autoCapitalize="none"
          testID="search-input"
        />
      </View>

      <FilterChips
        options={SCOPES.map((option) =>
          option.value === 'files' && files.length > 0
            ? { ...option, label: `Fichiers (${files.length})` }
            : option,
        )}
        value={scope}
        onChange={setScope}
      />

      {scope !== 'messages' ? (
        <FlatList
          data={visibleFiles}
          keyExtractor={(hit) => hit.attachment.id}
          contentContainerStyle={visibleFiles.length === 0 ? styles.grow : styles.files}
          renderItem={({ item }) => (
            <View style={styles.file}>
              <AttachmentList
                attachments={[item.attachment]}
                onOpen={() => router.push(`/thread/${item.threadId}`)}
                resolve={actions.resolve}
                onSave={(attachment) => void actions.save(attachment)}
                progress={actions.progress}
                pdfPreview={actions.pdfPreview}
              />
              <AppText variant="caption" color="textMuted" numberOfLines={1}>
                {item.senderName} · {new Date(item.receivedAt).toLocaleDateString('fr-FR')}
              </AppText>
            </View>
          )}
          ListEmptyComponent={emptyState}
        />
      ) : (
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
              <Avatar
                name={item.senderName || item.senderAddress}
                size={40}
                imageUri={service.getContactPhoto(item.senderAddress)}
              />
              <View style={styles.content}>
                <AppText variant="body" weight="semibold" numberOfLines={1}>
                  {item.subject || 'Sans objet'}
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
          ListEmptyComponent={emptyState}
        />
      )}
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
  files: {
    padding: Spacing.md,
    gap: Spacing.md,
  },
  file: {
    gap: Spacing.xs,
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
