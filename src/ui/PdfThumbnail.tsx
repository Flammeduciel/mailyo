import { MaterialIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import { PDFJS_BASE } from './PdfView';

/** Where a PDF thumbnail comes from and where it is kept. */
export interface PdfPreviewSource {
  /** Cached thumbnail URI, if one was rendered before. */
  cached: (attachmentId: string) => string | null;
  /** The PDF bytes (base64), downloading the attachment if needed. */
  load: (attachmentId: string) => Promise<string>;
  /** Persist a rendered thumbnail (JPEG base64); returns its URI. */
  save: (attachmentId: string, jpegBase64: string) => Promise<string>;
}

export interface PdfThumbnailProps {
  attachmentId: string;
  source: PdfPreviewSource;
  style?: StyleProp<ViewStyle>;
}

/**
 * First page of a PDF as a picture. Rendered once by pdf.js in an off-screen
 * WebView, then cached as a JPEG so later views cost nothing.
 */
export function PdfThumbnail({ attachmentId, source, style }: PdfThumbnailProps) {
  const [uri, setUri] = useState<string | null>(() => source.cached(attachmentId));
  const [pdf, setPdf] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (uri || failed) return;
    let cancelled = false;
    source
      .load(attachmentId)
      .then((base64) => {
        if (!cancelled) setPdf(base64);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [attachmentId, source, uri, failed]);

  const html = useMemo(() => (pdf ? buildRenderer(pdf) : null), [pdf]);

  const onMessage = (event: WebViewMessageEvent) => {
    const data = event.nativeEvent.data;
    if (!data.startsWith('data:image/jpeg;base64,')) {
      setFailed(true);
      return;
    }
    source
      .save(attachmentId, data.slice('data:image/jpeg;base64,'.length))
      .then(setUri)
      .catch(() => setFailed(true))
      .finally(() => setPdf(null));
  };

  return (
    <View style={[styles.box, style]}>
      {uri ? (
        <Image
          source={{ uri }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          contentPosition="top"
        />
      ) : (
        <MaterialIcons name="picture-as-pdf" size={44} color="#C62828" />
      )}
      {html && !uri ? (
        // Off-screen renderer: only its postMessage matters.
        <View style={styles.renderer} pointerEvents="none">
          <WebView
            originWhitelist={['*']}
            source={{ html }}
            javaScriptEnabled
            onMessage={onMessage}
            style={styles.renderer}
          />
        </View>
      ) : null}
    </View>
  );
}

function buildRenderer(base64: string): string {
  return `<!DOCTYPE html><html><body><script type="module">
  import * as pdfjs from '${PDFJS_BASE}/pdf.min.mjs';
  pdfjs.GlobalWorkerOptions.workerSrc = '${PDFJS_BASE}/pdf.worker.min.mjs';
  try {
    const raw = atob('${base64}');
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    const pdf = await pdfjs.getDocument({ data: bytes }).promise;
    const page = await pdf.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: 640 / base.width });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = Math.min(viewport.height, viewport.width * 0.75);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport }).promise;
    window.ReactNativeWebView.postMessage(canvas.toDataURL('image/jpeg', 0.82));
  } catch (e) {
    window.ReactNativeWebView.postMessage('error');
  }
</script></body></html>`;
}

const styles = StyleSheet.create({
  box: {
    backgroundColor: '#F4F1EE',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  renderer: {
    position: 'absolute',
    width: 2,
    height: 2,
    opacity: 0,
  },
});
