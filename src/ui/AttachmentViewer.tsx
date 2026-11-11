import { MaterialIcons } from '@expo/vector-icons';
import { useVideoPlayer, VideoView } from 'expo-video';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';

import { attachmentKind, formatFileSize, typeLabel } from '@/domain/attachments';
import type { Attachment } from '@/domain/models';

import { AppText } from './AppText';
import { Button } from './Button';
import { PdfView } from './PdfView';
import { Spacing } from './theme';
import { ZoomableImage } from './ZoomableImage';

export interface AttachmentViewerProps {
  /** Every attachment of the conversation: swipe left/right between them. */
  attachments: Attachment[];
  /** Index of the attachment to show, or null when closed. */
  index: number | null;
  resolve: (attachmentId: string) => Promise<Attachment>;
  /** Asks before a large download on mobile data. */
  allowDownload?: (attachment: Attachment) => Promise<boolean>;
  onSave: (attachment: Attachment) => void;
  onShare: (attachment: Attachment) => void;
  /** Attachment being saved/shared, with its download ratio when known. */
  progress?: { id: string; ratio: number | null } | null;
  onClose: () => void;
}

/** Full-screen gallery: image (zoom), video, PDF; other types go to the system. */
export function AttachmentViewer({
  attachments,
  index,
  resolve,
  allowDownload,
  onSave,
  onShare,
  progress,
  onClose,
}: AttachmentViewerProps) {
  const { width } = useWindowDimensions();
  const [current, setCurrent] = useState(index ?? 0);
  const [zoomed, setZoomed] = useState(false);
  const [openedAt, setOpenedAt] = useState(index);

  // A new opening resets the page (render-time sync, no effect needed).
  if (index !== openedAt) {
    setOpenedAt(index);
    if (index !== null) setCurrent(index);
  }

  const attachment = attachments[current] ?? null;
  const busy = progress && attachment && progress.id === attachment.id ? progress : null;

  return (
    <Modal visible={index !== null} animationType="fade" onRequestClose={onClose}>
      <SafeAreaView style={styles.screen}>
        <View style={styles.bar}>
          <Pressable onPress={onClose} accessibilityLabel="Fermer" hitSlop={Spacing.md}>
            <MaterialIcons name="close" size={26} color="#FFFFFF" />
          </Pressable>
          {attachment ? (
            <View style={styles.title}>
              <AppText variant="body" weight="semibold" style={styles.white} numberOfLines={1}>
                {attachment.filename}
              </AppText>
              <AppText variant="caption" style={styles.muted}>
                {typeLabel(attachment.mimeType, attachment.filename)} ·{' '}
                {formatFileSize(attachment.sizeBytes)}
                {attachments.length > 1 ? `  ·  ${current + 1}/${attachments.length}` : ''}
              </AppText>
            </View>
          ) : null}
          {attachment ? (
            busy ? (
              <View style={styles.progress}>
                <ActivityIndicator color="#FFFFFF" />
                {busy.ratio !== null ? (
                  <AppText variant="caption" style={styles.white}>
                    {Math.round(busy.ratio * 100)} %
                  </AppText>
                ) : null}
              </View>
            ) : (
              <>
                <Pressable
                  onPress={() => onSave(attachment)}
                  accessibilityLabel="Télécharger"
                  hitSlop={Spacing.sm}
                  testID="attachment-save"
                >
                  <MaterialIcons name="file-download" size={26} color="#FFFFFF" />
                </Pressable>
                <Pressable
                  onPress={() => onShare(attachment)}
                  accessibilityLabel="Partager"
                  hitSlop={Spacing.sm}
                  testID="attachment-share"
                >
                  <MaterialIcons name="share" size={24} color="#FFFFFF" />
                </Pressable>
              </>
            )
          ) : null}
        </View>

        {index !== null ? (
          <FlatList
            data={attachments}
            keyExtractor={(item) => item.id}
            horizontal
            pagingEnabled
            scrollEnabled={!zoomed}
            initialScrollIndex={index}
            getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={(event) => {
              const page = Math.round(event.nativeEvent.contentOffset.x / width);
              if (page !== current) {
                setCurrent(page);
                setZoomed(false);
              }
            }}
            renderItem={({ item, index: i }) => (
              <View style={{ width }}>
                <Page
                  attachment={item}
                  active={i === current}
                  resolve={resolve}
                  allowDownload={allowDownload}
                  onZoomChange={setZoomed}
                />
              </View>
            )}
          />
        ) : null}
      </SafeAreaView>
    </Modal>
  );
}

function Page({
  attachment,
  active,
  resolve,
  allowDownload,
  onZoomChange,
}: {
  attachment: Attachment;
  active: boolean;
  resolve: (attachmentId: string) => Promise<Attachment>;
  allowDownload?: (attachment: Attachment) => Promise<boolean>;
  onZoomChange: (zoomed: boolean) => void;
}) {
  const [result, setResult] = useState<{ uri: string | null; error: string | null } | null>(null);
  const [declined, setDeclined] = useState(false);
  const kind = attachmentKind(attachment.mimeType, attachment.filename);

  // Only the visible page downloads, so swiping past big files costs nothing.
  useEffect(() => {
    if (!active || result || declined) {
      return;
    }
    let cancelled = false;
    void (async () => {
      if (allowDownload && !(await allowDownload(attachment))) {
        if (!cancelled) setDeclined(true);
        return;
      }
      try {
        const resolved = await resolve(attachment.id);
        if (!cancelled) setResult({ uri: resolved.localPath, error: null });
      } catch (cause) {
        if (!cancelled) {
          setResult({ uri: null, error: cause instanceof Error ? cause.message : String(cause) });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [active, attachment, allowDownload, declined, resolve, result]);

  const uri = result?.uri ?? null;
  let body;
  if (declined) {
    body = (
      <View style={styles.center}>
        <AppText style={styles.white}>Téléchargement annulé.</AppText>
        <Button label="Télécharger" onPress={() => setDeclined(false)} />
      </View>
    );
  } else if (result?.error) {
    body = <AppText style={styles.white}>{result.error}</AppText>;
  } else if (!uri) {
    body = <ActivityIndicator color="#FFFFFF" size="large" />;
  } else if (kind === 'image') {
    body = <ZoomableImage uri={uri} onZoomChange={onZoomChange} />;
  } else if (kind === 'video') {
    body = active ? <VideoPlayer uri={uri} /> : null;
  } else if (kind === 'pdf') {
    body =
      Platform.OS === 'ios' || /^https?:/i.test(uri) ? (
        <WebView source={{ uri }} style={styles.fill} allowFileAccess originWhitelist={['*']} />
      ) : (
        <PdfView uri={uri} />
      );
  } else {
    body = <OpenExternally uri={uri} attachment={attachment} />;
  }
  return <View style={styles.content}>{body}</View>;
}

function VideoPlayer({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, (instance) => {
    instance.play();
  });
  return <VideoView player={player} style={styles.fill} nativeControls contentFit="contain" />;
}

/** Types the app cannot render: hand them to an installed app. */
function OpenExternally({ uri, attachment }: { uri: string; attachment: Attachment }) {
  const open = async () => {
    if (/^https?:/i.test(uri)) {
      await WebBrowser.openBrowserAsync(uri);
      return;
    }
    const Sharing = await import('expo-sharing');
    await Sharing.shareAsync(uri, { mimeType: attachment.mimeType, dialogTitle: 'Ouvrir avec' });
  };
  return (
    <View style={styles.center}>
      <MaterialIcons name="insert-drive-file" size={64} color="#FFFFFF" />
      <AppText style={styles.white}>{attachment.filename}</AppText>
      <Button label="Ouvrir avec…" onPress={() => void open()} testID="attachment-open" />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#000000' },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.lg,
    padding: Spacing.md,
  },
  title: { flex: 1 },
  white: { color: '#FFFFFF' },
  muted: { color: '#B0B8BF' },
  progress: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  center: { alignItems: 'center', gap: Spacing.md, padding: Spacing.xl },
  fill: { flex: 1, width: '100%' },
});
