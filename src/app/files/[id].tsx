import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { attachmentKind, formatFileSize, type AttachmentKind } from '@/domain/attachments';
import type { Attachment } from '@/domain/models';
import { useAttachmentActions } from '@/state/use-attachment-actions';
import { useServiceQuery } from '@/state/use-service-query';
import { AppBar, AttachmentList, EmptyState, FilterChips, Spacing, useAppTheme } from '@/ui';
import { AttachmentViewer } from '@/ui/AttachmentViewer';

type Filter = 'all' | 'media' | 'pdf' | 'other';

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'Tous' },
  { value: 'media', label: 'Photos et vidéos' },
  { value: 'pdf', label: 'PDF' },
  { value: 'other', label: 'Autres' },
];

function matches(filter: Filter, kind: AttachmentKind): boolean {
  switch (filter) {
    case 'media':
      return kind === 'image' || kind === 'video';
    case 'pdf':
      return kind === 'pdf';
    case 'other':
      return kind !== 'image' && kind !== 'video' && kind !== 'pdf';
    default:
      return true;
  }
}

/** Every file exchanged in a conversation, newest first, with type filters. */
export default function ConversationFilesScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useAppTheme();
  const actions = useAttachmentActions();
  const [filter, setFilter] = useState<Filter>('all');
  const [viewedIndex, setViewedIndex] = useState<number | null>(null);

  const { data, loading } = useServiceQuery<Attachment[]>(async (service) => {
    const grouped = await service.getThreadAttachments(id);
    return Object.values(grouped).flat().reverse();
  }, []);

  const visible = useMemo(
    () => data.filter((item) => matches(filter, attachmentKind(item.mimeType, item.filename))),
    [data, filter],
  );
  const total = visible.reduce((sum, item) => sum + item.sizeBytes, 0);

  return (
    <SafeAreaView edges={['top']} style={[styles.screen, { backgroundColor: colors.background }]}>
      <AppBar
        title="Fichiers"
        subtitle={`${visible.length} fichier${visible.length > 1 ? 's' : ''} · ${formatFileSize(total)}`}
        onBack={() => router.back()}
      />
      <FilterChips options={FILTERS} value={filter} onChange={setFilter} />
      <FlatList
        data={visible}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <View style={styles.item}>
            <AttachmentList
              attachments={[item]}
              onOpen={() => setViewedIndex(visible.indexOf(item))}
              resolve={actions.resolve}
              onSave={(attachment) => void actions.save(attachment)}
              progress={actions.progress}
              pdfPreview={actions.pdfPreview}
            />
          </View>
        )}
        ListEmptyComponent={
          loading ? null : (
            <EmptyState
              icon="paperclip"
              title="Aucun fichier"
              description="Rien dans cette catégorie."
            />
          )
        }
      />
      <AttachmentViewer
        attachments={visible}
        index={viewedIndex}
        resolve={actions.resolve}
        allowDownload={actions.allowDownload}
        onSave={(attachment) => void actions.save(attachment)}
        onShare={(attachment) => void actions.share(attachment)}
        progress={actions.progress}
        onClose={() => setViewedIndex(null)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  list: { padding: Spacing.md, gap: Spacing.sm },
  item: { width: '100%' },
});
