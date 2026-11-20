import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { MaterialIcons } from '@expo/vector-icons';
import { FlatList, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { attachmentKind } from '@/domain/attachments';
import { excerptAround } from '@/domain/highlight';
import type { Message } from '@/domain/models';
import type { FileSearchHit } from '@/services/mail-service';
import { useApp } from '@/state/app-context';
import { useAttachmentActions } from '@/state/use-attachment-actions';
import {
  AttachmentList,
  Avatar,
  Divider,
  EmptyState,
  FilterChips,
  HighlightText,
  IconButton,
  Screen,
  Spacing,
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
      {/* The field is the header and gets the keyboard at once (no second tap). */}
      <View style={styles.header}>
        <IconButton icon="arrow-back" accessibilityLabel="Retour" onPress={() => router.back()} />
        <View style={[styles.pill, { backgroundColor: theme.surfaceAlt }]}>
          <MaterialIcons name="search" size={20} color={theme.textMuted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Rechercher"
            placeholderTextColor={theme.textMuted}
            autoFocus
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            style={[styles.input, { color: theme.text }]}
            testID="search-input"
          />
          {query.length > 0 ? (
            <IconButton
              icon="close"
              accessibilityLabel="Effacer"
              onPress={() => setQuery('')}
              size={18}
              color={theme.textMuted}
            />
          ) : null}
        </View>
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
              <HighlightText
                text={`${item.attachment.filename} · ${item.senderName} · ${new Date(item.receivedAt).toLocaleDateString('fr-FR')}`}
                query={trimmed}
                numberOfLines={1}
                style={[styles.small, { color: theme.textMuted }]}
              />
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
                <HighlightText
                  text={item.subject || 'Sans objet'}
                  query={trimmed}
                  numberOfLines={1}
                  style={[styles.subject, { color: theme.text }]}
                />
                <HighlightText
                  text={
                    service.displayName(item.senderAddress, item.senderName) || item.senderAddress
                  }
                  query={trimmed}
                  numberOfLines={1}
                  style={[styles.small, { color: theme.textSecondary }]}
                />
                <HighlightText
                  text={excerptAround(item.bodyText, trimmed)}
                  query={trimmed}
                  numberOfLines={2}
                  style={[styles.small, { color: theme.textMuted }]}
                />
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.xs,
    paddingTop: Spacing.xs,
    paddingBottom: Spacing.sm,
  },
  pill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    height: 46,
    borderRadius: 999,
    paddingLeft: Spacing.md,
    paddingRight: Spacing.xs,
    marginRight: Spacing.sm,
  },
  input: {
    flex: 1,
    fontSize: 16,
    paddingVertical: 0,
  },
  subject: {
    fontSize: 15,
    fontWeight: '600',
  },
  small: {
    fontSize: 13,
    lineHeight: 18,
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
