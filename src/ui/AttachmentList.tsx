import { MaterialIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import {
  attachmentKind,
  formatFileSize,
  typeLabel,
  type AttachmentKind,
} from '@/domain/attachments';
import type { Attachment } from '@/domain/models';

import { AppText } from './AppText';
import { Radius, Spacing, useAppTheme } from './theme';
import { PdfThumbnail, type PdfPreviewSource } from './PdfThumbnail';
import { VideoThumbnail } from './VideoThumbnail';

const KIND_ICON: Record<AttachmentKind, keyof typeof MaterialIcons.glyphMap> = {
  image: 'image',
  video: 'videocam',
  audio: 'audiotrack',
  pdf: 'picture-as-pdf',
  document: 'description',
  archive: 'folder-zip',
  file: 'insert-drive-file',
};

export interface AttachmentListProps {
  attachments: Attachment[];
  onOpen: (attachment: Attachment) => void;
  /** Downloads (if needed) and returns the attachment with a `localPath`. */
  resolve?: (attachmentId: string) => Promise<Attachment>;
  /** Images up to this size are fetched automatically for a thumbnail (0 = never). */
  autoPreviewMaxBytes?: number;
  /** Save a copy on the device. */
  onSave?: (attachment: Attachment) => void;
  /** Attachment being downloaded, with its ratio when known. */
  progress?: { id: string; ratio: number | null } | null;
  /** Enables first-page thumbnails for PDFs. */
  pdfPreview?: PdfPreviewSource;
  testID?: string;
}

export function AttachmentList({
  attachments,
  onOpen,
  resolve,
  autoPreviewMaxBytes = 3 * 1024 * 1024,
  onSave,
  progress,
  pdfPreview,
  testID,
}: AttachmentListProps) {
  if (attachments.length === 0) {
    return null;
  }
  return (
    <View style={styles.list} testID={testID}>
      {attachments.map((attachment) => (
        <AttachmentTile
          key={attachment.id}
          attachment={attachment}
          onOpen={onOpen}
          resolve={resolve}
          autoPreviewMaxBytes={autoPreviewMaxBytes}
          onSave={onSave}
          progress={progress?.id === attachment.id ? progress : null}
          pdfPreview={pdfPreview}
        />
      ))}
    </View>
  );
}

function AttachmentTile({
  attachment,
  onOpen,
  resolve,
  autoPreviewMaxBytes,
  onSave,
  progress,
  pdfPreview,
}: {
  attachment: Attachment;
  onOpen: (attachment: Attachment) => void;
  resolve?: (attachmentId: string) => Promise<Attachment>;
  autoPreviewMaxBytes: number;
  onSave?: (attachment: Attachment) => void;
  progress: { id: string; ratio: number | null } | null;
  pdfPreview?: PdfPreviewSource;
}) {
  const colors = useAppTheme();
  const kind = attachmentKind(attachment.mimeType, attachment.filename);
  const [fetched, setFetched] = useState<{ id: string; path: string | null }>();

  // Thumbnail for images: use the cached copy, or fetch small ones.
  useEffect(() => {
    if (
      kind !== 'image' ||
      attachment.localPath ||
      !resolve ||
      attachment.sizeBytes > autoPreviewMaxBytes
    ) {
      return;
    }
    let cancelled = false;
    resolve(attachment.id)
      .then((resolved) => {
        if (!cancelled) setFetched({ id: attachment.id, path: resolved.localPath });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [
    attachment.id,
    attachment.localPath,
    attachment.sizeBytes,
    autoPreviewMaxBytes,
    kind,
    resolve,
  ]);

  const localPath = attachment.localPath ?? (fetched?.id === attachment.id ? fetched.path : null);

  const meta = `${typeLabel(attachment.mimeType, attachment.filename)} · ${formatFileSize(attachment.sizeBytes)}`;
  const showImage = kind === 'image' && localPath;

  return (
    <Pressable
      onPress={() => onOpen(attachment)}
      accessibilityRole="button"
      accessibilityLabel={`${attachment.filename}, ${meta}`}
      style={[styles.tile, { backgroundColor: colors.quoteBackground }]}
      testID={`attachment-${attachment.id}`}
    >
      {showImage ? (
        <Image source={{ uri: localPath }} style={styles.image} contentFit="cover" />
      ) : kind === 'video' ? (
        <VideoThumbnail uri={localPath} style={styles.image} />
      ) : kind === 'pdf' &&
        pdfPreview &&
        (attachment.sizeBytes <= autoPreviewMaxBytes || pdfPreview.cached(attachment.id)) ? (
        <PdfThumbnail attachmentId={attachment.id} source={pdfPreview} style={styles.image} />
      ) : null}
      <View style={styles.info}>
        <View style={[styles.iconBox, { backgroundColor: colors.primaryContainer }]}>
          <MaterialIcons
            name={KIND_ICON[kind]}
            size={22}
            color={kind === 'pdf' ? colors.danger : colors.primary}
          />
        </View>
        <View style={styles.text}>
          <AppText variant="caption" weight="semibold" numberOfLines={1}>
            {attachment.filename}
          </AppText>
          <AppText variant="caption" color="textMuted">
            {meta}
            {attachment.localPath && !/^https?:/i.test(attachment.localPath) ? ' · Téléchargé' : ''}
          </AppText>
        </View>
        {progress ? (
          <View style={styles.save}>
            <ActivityIndicator size="small" color={colors.primary} />
            {progress.ratio !== null ? (
              <AppText variant="caption" color="textMuted">
                {Math.round(progress.ratio * 100)} %
              </AppText>
            ) : null}
          </View>
        ) : onSave ? (
          <Pressable
            onPress={() => onSave(attachment)}
            accessibilityRole="button"
            accessibilityLabel={`Télécharger ${attachment.filename}`}
            hitSlop={Spacing.sm}
            style={styles.save}
            testID={`attachment-save-${attachment.id}`}
          >
            <MaterialIcons name="file-download" size={22} color={colors.primary} />
          </Pressable>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: Spacing.xs,
    minWidth: 220,
  },
  tile: {
    borderRadius: Radius.sm,
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: 150,
  },
  save: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 32,
  },
  info: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.sm,
  },
  iconBox: {
    width: 38,
    height: 38,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    flex: 1,
  },
});
