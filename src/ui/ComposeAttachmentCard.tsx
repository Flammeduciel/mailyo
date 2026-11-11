import { MaterialIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { attachmentKind, formatFileSize, typeLabel } from '@/domain/attachments';

import { AppText } from './AppText';
import { Radius, Spacing, useAppTheme } from './theme';
import { VideoThumbnail } from './VideoThumbnail';

export interface ComposeAttachment {
  uri: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
}

export interface ComposeAttachmentCardProps {
  file: ComposeAttachment;
  onRename: (filename: string) => void;
  onRemove: () => void;
  testID?: string;
}

function splitName(filename: string): { base: string; extension: string } {
  const dot = filename.lastIndexOf('.');
  return dot > 0
    ? { base: filename.slice(0, dot), extension: filename.slice(dot) }
    : { base: filename, extension: '' };
}

/**
 * A file about to be sent: preview (photo, first frame of a video, or type
 * icon), name that can be edited (the extension is kept), type and size, and
 * a button to take it out.
 */
export function ComposeAttachmentCard({
  file,
  onRename,
  onRemove,
  testID,
}: ComposeAttachmentCardProps) {
  const colors = useAppTheme();
  const kind = attachmentKind(file.mimeType, file.filename);
  const { base, extension } = splitName(file.filename);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(base);

  const commit = () => {
    const cleaned = draft
      .replace(/[\\/:*?"<>|]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (cleaned) onRename(`${cleaned}${extension}`);
    else setDraft(base);
    setEditing(false);
  };

  return (
    <View
      style={[styles.card, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}
      testID={testID}
    >
      <View style={[styles.preview, { backgroundColor: colors.primaryContainer }]}>
        {kind === 'image' ? (
          <Image source={{ uri: file.uri }} style={StyleSheet.absoluteFill} contentFit="cover" />
        ) : kind === 'video' ? (
          <VideoThumbnail uri={file.uri} style={StyleSheet.absoluteFill} />
        ) : (
          <MaterialIcons
            name={kind === 'pdf' ? 'picture-as-pdf' : 'insert-drive-file'}
            size={30}
            color={kind === 'pdf' ? colors.danger : colors.primary}
          />
        )}
      </View>
      <View style={styles.info}>
        {editing ? (
          <View style={styles.editRow}>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              onSubmitEditing={commit}
              onBlur={commit}
              autoFocus
              selectTextOnFocus
              style={[styles.input, { color: colors.text, borderBottomColor: colors.primary }]}
              testID={testID ? `${testID}-name` : undefined}
            />
            <AppText variant="caption" color="textSecondary">
              {extension}
            </AppText>
          </View>
        ) : (
          <Pressable
            onPress={() => {
              setDraft(base);
              setEditing(true);
            }}
            style={styles.nameRow}
            accessibilityRole="button"
            accessibilityLabel={`Renommer ${file.filename}`}
            testID={testID ? `${testID}-rename` : undefined}
          >
            <AppText variant="body" weight="semibold" numberOfLines={1} style={styles.name}>
              {file.filename}
            </AppText>
            <MaterialIcons name="edit" size={15} color={colors.textMuted} />
          </Pressable>
        )}
        <AppText variant="caption" color="textSecondary">
          {typeLabel(file.mimeType, file.filename)} ·{' '}
          {file.sizeBytes > 0 ? formatFileSize(file.sizeBytes) : 'taille inconnue'}
        </AppText>
      </View>
      <Pressable
        onPress={onRemove}
        hitSlop={Spacing.sm}
        style={[styles.remove, { backgroundColor: colors.background }]}
        accessibilityRole="button"
        accessibilityLabel={`Retirer ${file.filename}`}
        testID={testID ? `${testID}-remove` : undefined}
      >
        <MaterialIcons name="close" size={18} color={colors.textSecondary} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.sm,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  preview: {
    width: 56,
    height: 56,
    borderRadius: Radius.sm,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: { flex: 1, gap: 2 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  name: { flexShrink: 1 },
  editRow: { flexDirection: 'row', alignItems: 'center' },
  input: { flex: 1, fontSize: 15, paddingVertical: 2, borderBottomWidth: 2 },
  remove: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
