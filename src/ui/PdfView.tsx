import { File } from 'expo-file-system';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';

import { AppText } from './AppText';

export interface PdfViewProps {
  /** Local `file://` URI of the PDF. */
  uri: string;
}

const PDFJS = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/legacy/build';

/**
 * In-app PDF reader for Android, whose WebView cannot display PDFs: the bytes
 * stay on the device and are rendered page by page by pdf.js (only the
 * library itself is fetched from the CDN). Pinch-zoom is the WebView's own.
 */
export function PdfView({ uri }: PdfViewProps) {
  const [data, setData] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    new File(uri)
      .base64()
      .then((base64) => {
        if (!cancelled) setData(base64);
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause));
      });
    return () => {
      cancelled = true;
    };
  }, [uri]);

  const source = useMemo(() => (data ? { html: buildDocument(data) } : null), [data]);

  if (error) {
    return <AppText style={styles.white}>{error}</AppText>;
  }
  if (!source) {
    return <ActivityIndicator color="#FFFFFF" size="large" />;
  }
  return (
    <View style={styles.fill}>
      <WebView
        originWhitelist={['*']}
        source={source}
        style={styles.fill}
        javaScriptEnabled
        setBuiltInZoomControls
        setDisplayZoomControls={false}
      />
    </View>
  );
}

function buildDocument(base64: string): string {
  return `<!DOCTYPE html><html><head>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=5">
<style>
  html, body { margin: 0; background: #2b2b2b; }
  canvas { display: block; width: 100%; margin: 0 0 8px; background: #fff; }
  #status { color: #ddd; font: 15px sans-serif; text-align: center; padding: 40px 16px; }
</style></head><body>
<div id="status">Chargement du PDF…</div>
<script type="module">
  import * as pdfjs from '${PDFJS}/pdf.min.mjs';
  pdfjs.GlobalWorkerOptions.workerSrc = '${PDFJS}/pdf.worker.min.mjs';
  const raw = atob('${base64}');
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  try {
    const pdf = await pdfjs.getDocument({ data: bytes }).promise;
    document.getElementById('status').remove();
    const ratio = window.devicePixelRatio || 1;
    for (let n = 1; n <= pdf.numPages; n++) {
      const page = await pdf.getPage(n);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: (window.innerWidth / base.width) * ratio });
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      document.body.appendChild(canvas);
      await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
    }
  } catch (e) {
    document.getElementById('status').textContent = 'Impossible d’afficher ce PDF (connexion requise pour le lecteur).';
  }
</script></body></html>`;
}

const styles = StyleSheet.create({
  fill: { flex: 1, width: '100%' },
  white: { color: '#FFFFFF' },
});
