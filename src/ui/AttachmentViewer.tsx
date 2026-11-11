import { MaterialIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as Sharing from 'expo-sharing';
import { useVideoPlayer, VideoView } from 'expo-video';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';

import { attachmentKind, formatFileSize, typeLabel } from '@/domain/attachments';
import type { Attachment } from '@/domain/models';

import { AppText } from './AppText';
import { Button } from './Button';
import { Spacing, useAppTheme } from './theme';

export interface AttachmentViewerProps {
  attachment: Attachment | null;
  resolve: (attachmentId: string) => Promise<Attachment>;
  onClose: () => void;
}

/** Full-screen preview: image, video and PDF; anything else is handed to the system. */
export function AttachmentViewer({ attachment, resolve, onClose }: AttachmentViewerProps) {
  const colors = useAppTheme();
  const [result, setResult] = useState<{ id: string; uri: string | null; error: string | null }>();

  useEffect(() => {
    if (!attachment) {
      return;
    }
    let cancelled = false;
    resolve(attachment.id)
      .then((resolved) => {
        if (!cancelled) setResult({ id: attachment.id, uri: resolved.localPath, error: null });
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          const message = cause instanceof Error ? cause.message : String(cause);
          setResult({ id: attachment.id, uri: null, error: message });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [attachment, resolve]);

  // Ignore a result that belongs to a previously opened attachment.
  const current = result && attachment && result.id === attachment.id ? result : null;
  const uri = current?.uri ?? null;
  const error = current?.error ?? null;

  const kind = attachment ? attachmentKind(attachment.mimeType, attachment.filename) : 'file';

  return (
    <Modal visible={attachment !== null} animationType="fade" onRequestClose={onClose}>
      <SafeAreaView style={[styles.screen, { backgroundColor: '#000000' }]}>
        <View style={styles.bar}>
          <Pressable onPress={onClose} accessibilityLabel="Fermer" hitSlop={Spacing.md}>
            <MaterialIcons name="close" size={26} color="#FFFFFF" />
          </Pressable>
          {attachment ? (
            <View style={styles.title}>
              <AppText variant="body" weight="semibold" style={styles.white} numberOfLines={1}>
                {attachment.filename}
              </AppText>
              <AppText variant="caption" style={styles.whiteMuted}>
                {typeLabel(attachment.mimeType, attachment.filename)} ·{' '}
                {formatFileSize(attachment.sizeBytes)}
              </AppText>
            </View>
          ) : null}
        </View>

        <View style={styles.content}>
          {error ? (
            <AppText style={styles.white}>{error}</AppText>
          ) : !uri ? (
            <ActivityIndicator color={colors.primary} size="large" />
          ) : kind === 'image' ? (
            <Image source={{ uri }} style={styles.fill} contentFit="contain" />
          ) : kind === 'video' ? (
            <VideoPlayer uri={uri} />
          ) : kind === 'pdf' && Platform.OS === 'ios' ? (
            <WebView source={{ uri }} style={styles.fill} allowFileAccess originWhitelist={['*']} />
          ) : (
            <OpenExternally uri={uri} attachment={attachment} />
          )}
        </View>
      </SafeAreaView>
    </Modal>
  );
}

function VideoPlayer({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, (instance) => {
    instance.play();
  });
  return <VideoView player={player} style={styles.fill} nativeControls contentFit="contain" />;
}

/** PDF on Android and other types: the system viewer renders them best. */
function OpenExternally({ uri, attachment }: { uri: string; attachment: Attachment | null }) {
  const open = async () => {
    if (uri.startsWith('file:')) {
      await Sharing.shareAsync(uri, { mimeType: attachment?.mimeType, dialogTitle: 'Ouvrir avec' });
    } else {
      await WebBrowser.openBrowserAsync(uri);
    }
  };
  return (
    <View style={styles.external}>
      <MaterialIcons name="picture-as-pdf" size={64} color="#FFFFFF" />
      <AppText style={styles.white}>{attachment?.filename}</AppText>
      <Button label="Ouvrir l’aperçu" onPress={() => void open()} testID="attachment-open" />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.md,
  },
  title: { flex: 1 },
  white: { color: '#FFFFFF' },
  whiteMuted: { color: '#B0B8BF' },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  fill: { flex: 1, width: '100%' },
  external: { alignItems: 'center', gap: Spacing.md, padding: Spacing.xl },
});
