import { MaterialIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import {
  attachmentKind,
  formatFileSize,
  typeLabel,
  type AttachmentKind,
} from '@/domain/attachments';
import type { Attachment } from '@/domain/models';

import { AppText } from './AppText';
import { Radius, Spacing, useAppTheme } from './theme';

const KIND_ICON: Record<AttachmentKind, keyof typeof MaterialIcons.glyphMap> = {
  image: 'image',
  video: 'videocam',
  audio: 'audiotrack',
  pdf: 'picture-as-pdf',
  document: 'description',
  archive: 'folder-zip',
  file: 'insert-drive-file',
};

/** Images below this size are fetched automatically to show a thumbnail. */
const AUTO_PREVIEW_MAX_BYTES = 3 * 1024 * 1024;

export interface AttachmentListProps {
  attachments: Attachment[];
  onOpen: (attachment: Attachment) => void;
  /** Downloads (if needed) and returns the attachment with a `localPath`. */
  resolve?: (attachmentId: string) => Promise<Attachment>;
  testID?: string;
}

export function AttachmentList({ attachments, onOpen, resolve, testID }: AttachmentListProps) {
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
        />
      ))}
    </View>
  );
}

function AttachmentTile({
  attachment,
  onOpen,
  resolve,
}: {
  attachment: Attachment;
  onOpen: (attachment: Attachment) => void;
  resolve?: (attachmentId: string) => Promise<Attachment>;
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
      attachment.sizeBytes > AUTO_PREVIEW_MAX_BYTES
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
  }, [attachment.id, attachment.localPath, attachment.sizeBytes, kind, resolve]);

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
        <View style={[styles.image, styles.videoBox]}>
          <MaterialIcons name="play-circle-filled" size={44} color="#FFFFFF" />
        </View>
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
          </AppText>
        </View>
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
  videoBox: {
    backgroundColor: '#1F2933',
    alignItems: 'center',
    justifyContent: 'center',
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
