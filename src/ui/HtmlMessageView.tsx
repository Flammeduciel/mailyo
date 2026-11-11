import { MaterialIcons } from '@expo/vector-icons';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Alert, Modal, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView, type WebViewMessageEvent, type WebViewNavigation } from 'react-native-webview';

import { blockRemoteImages, deceptiveLinkDomain, hostOf } from '@/domain/html-privacy';

import { AppText } from './AppText';
import { openLink } from './open-link';
import { Radius, Spacing, useAppTheme } from './theme';
import { useResolvedScheme } from './theme-preference';

export interface HtmlMessageViewProps {
  /** Already sanitised HTML (`sanitizeHtml`). */
  html: string;
  /** Offer the quoted-history toggle (off when the parent is already shown). */
  allowHistory?: boolean;
  /** Keep remote images unloaded until "Afficher les images". */
  blockImages?: boolean;
  testID?: string;
}

/**
 * Reports the content height to React Native, shrinks wide (fixed 600px)
 * newsletters to the screen width, toggles quoted history on demand and
 * routes link taps through React Native (so they can be checked first).
 * Runs on our own document only: incoming scripts and handlers are already
 * stripped by the sanitiser.
 */
const MEASURE_SCRIPT = `
(function () {
  var post = function (data) { window.ReactNativeWebView.postMessage(JSON.stringify(data)); };
  function fit() {
    var body = document.body;
    if (!body) return;
    body.style.zoom = 1;
    var width = document.documentElement.scrollWidth;
    var viewport = window.innerWidth;
    if (width > viewport + 2) body.style.zoom = viewport / width;
    var zoom = parseFloat(body.style.zoom) || 1;
    var height = Math.ceil(body.scrollHeight * zoom);
    var hasQuote = !!document.querySelector('.gmail_quote, blockquote[type=cite], #divRplyFwdMsg, .yahoo_quoted, .moz-cite-prefix');
    post({ type: 'size', height: height, hasQuote: hasQuote, shrunk: zoom < 0.98 });
  }
  window.__mailyoToggleQuotes = function () {
    document.body.classList.toggle('show-quotes');
    setTimeout(fit, 50);
  };
  document.addEventListener('click', function (event) {
    var link = event.target.closest && event.target.closest('a[href]');
    if (!link) return;
    event.preventDefault();
    post({ type: 'link', href: link.href, text: (link.innerText || '').slice(0, 200) });
  }, true);
  window.addEventListener('load', fit);
  Array.prototype.forEach.call(document.images, function (img) { img.addEventListener('load', fit); });
  if (window.ResizeObserver) new ResizeObserver(fit).observe(document.body);
  setTimeout(fit, 30);
})();
true;
`;

/** Full-screen reader: no shrinking, real pinch-zoom and horizontal scroll. */
const READER_SCRIPT = `
(function () {
  document.addEventListener('click', function (event) {
    var link = event.target.closest && event.target.closest('a[href]');
    if (!link) return;
    event.preventDefault();
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'link', href: link.href, text: (link.innerText || '').slice(0, 200) }));
  }, true);
})();
true;
`;

function buildDocument(html: string, options: { dark: boolean; reader: boolean }): string {
  const viewport = options.reader
    ? 'width=device-width, initial-scale=1, minimum-scale=0.25, maximum-scale=5, user-scalable=yes'
    : 'width=device-width, initial-scale=1, maximum-scale=1';
  // Mails are designed for white backgrounds: in dark mode the whole page is
  // inverted, then pictures are inverted back so they keep their colours.
  const dark = options.dark
    ? `html { filter: invert(1) hue-rotate(180deg); background: #fff; }
       img, video, picture, [style*="background-image"] { filter: invert(1) hue-rotate(180deg); }`
    : '';
  const shrink = options.reader
    ? ''
    : `table { max-width: 100% !important; }
       table[width], td[width], th[width], div[style*="width"] { width: auto !important; }
       td, th, div, p, span { max-width: 100%; overflow-wrap: anywhere; }`;
  return `<!DOCTYPE html><html><head>
<meta name="viewport" content="${viewport}">
<style>
  *, *::before, *::after { box-sizing: border-box; }
  html, body { margin: 0; background: #fff; }
  body { padding: 12px 14px; color: #1f2328; font-family: sans-serif; font-size: 15px;
         line-height: 1.45; word-wrap: break-word; overflow-wrap: anywhere; }
  a { color: #0b6bcb; word-break: break-word; overflow-wrap: anywhere; }
  img { max-width: 100% !important; height: auto !important; }
  img[data-mailyo-src] { display: none; }
  table { border-collapse: collapse; }
  ${shrink}
  pre { white-space: pre-wrap; }
  blockquote { margin: 0 0 0 8px; padding-left: 8px; border-left: 3px solid rgba(127,127,127,.4); }
  .gmail_quote, blockquote[type=cite], #divRplyFwdMsg, #divRplyFwdMsg ~ *, .yahoo_quoted,
  .moz-cite-prefix, .moz-cite-prefix ~ blockquote { display: none; }
  body.show-quotes .gmail_quote, body.show-quotes blockquote[type=cite],
  body.show-quotes #divRplyFwdMsg, body.show-quotes #divRplyFwdMsg ~ *,
  body.show-quotes .yahoo_quoted, body.show-quotes .moz-cite-prefix,
  body.show-quotes .moz-cite-prefix ~ blockquote { display: block; }
  ${dark}
</style></head><body>${html}</body></html>`;
}

/** Ask before leaving the app; warn loudly when the link text lies about its target. */
export function confirmAndOpenLink(href: string, text = ''): void {
  const host = hostOf(href);
  if (!host) {
    void openLink(href);
    return;
  }
  const shown = deceptiveLinkDomain(text, href);
  Alert.alert(
    shown ? 'Lien suspect' : 'Ouvrir ce lien ?',
    shown
      ? `Le texte affiche « ${shown} » mais le lien mène à « ${host} ». C’est souvent un signe d’hameçonnage.`
      : host,
    [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Ouvrir',
        style: shown ? 'destructive' : 'default',
        onPress: () => void openLink(href),
      },
    ],
    { cancelable: true },
  );
}

/**
 * Faithful rendering of an HTML email (layout, images, tables, links), shown
 * in full: no "Afficher plus". Wide newsletters can be opened in a zoomable
 * full-screen reader.
 */
export function HtmlMessageView({
  html,
  allowHistory = true,
  blockImages = false,
  testID,
}: HtmlMessageViewProps) {
  const colors = useAppTheme();
  const scheme = useResolvedScheme();
  const webView = useRef<WebView>(null);
  const [height, setHeight] = useState(60);
  const [hasQuote, setHasQuote] = useState(false);
  const [shrunk, setShrunk] = useState(false);
  const [quotesShown, setQuotesShown] = useState(false);
  const [imagesAllowed, setImagesAllowed] = useState(false);
  const [original, setOriginal] = useState(false);
  const [reader, setReader] = useState(false);

  const dark = scheme === 'dark' && !original;
  const prepared = useMemo(
    () => (blockImages && !imagesAllowed ? blockRemoteImages(html) : { html, blocked: 0 }),
    [html, blockImages, imagesAllowed],
  );
  const source = useMemo(
    () => ({ html: buildDocument(prepared.html, { dark, reader: false }), baseUrl: '' }),
    [prepared.html, dark],
  );
  const readerSource = useMemo(
    () => ({ html: buildDocument(prepared.html, { dark, reader: true }), baseUrl: '' }),
    [prepared.html, dark],
  );

  const onMessage = useCallback((event: WebViewMessageEvent) => {
    try {
      const data = JSON.parse(event.nativeEvent.data) as {
        type?: string;
        height?: number;
        hasQuote?: boolean;
        shrunk?: boolean;
        href?: string;
        text?: string;
      };
      if (data.type === 'link' && data.href) {
        confirmAndOpenLink(data.href, data.text);
        return;
      }
      if (typeof data.height === 'number' && data.height > 0) {
        setHeight(data.height);
      }
      setHasQuote(Boolean(data.hasQuote));
      setShrunk(Boolean(data.shrunk));
    } catch {
      // Ignore foreign messages.
    }
  }, []);

  // Navigations not caught by the click script (forms, redirects) are links too.
  const onShouldStartLoad = useCallback((request: WebViewNavigation) => {
    if (request.url.startsWith('about:') || request.url.startsWith('data:')) {
      return true;
    }
    confirmAndOpenLink(request.url);
    return false;
  }, []);

  const linkStyle = { color: colors.link };

  return (
    <View testID={testID}>
      {prepared.blocked > 0 ? (
        <Pressable
          onPress={() => setImagesAllowed(true)}
          style={[styles.banner, { backgroundColor: colors.surfaceAlt }]}
          accessibilityRole="button"
          testID={testID ? `${testID}-show-images` : undefined}
        >
          <MaterialIcons name="hide-image" size={16} color={colors.textSecondary} />
          <AppText variant="caption" color="textSecondary" style={styles.bannerText}>
            Images masquées pour votre vie privée
          </AppText>
          <AppText variant="caption" weight="semibold" style={linkStyle}>
            Afficher
          </AppText>
        </Pressable>
      ) : null}
      <View style={[styles.card, { height, backgroundColor: dark ? '#000000' : '#FFFFFF' }]}>
        <WebView
          ref={webView}
          originWhitelist={['*']}
          source={source}
          style={styles.webview}
          scrollEnabled={false}
          nestedScrollEnabled={false}
          javaScriptEnabled
          injectedJavaScript={MEASURE_SCRIPT}
          onMessage={onMessage}
          onShouldStartLoadWithRequest={onShouldStartLoad}
          setSupportMultipleWindows={false}
          showsVerticalScrollIndicator={false}
          showsHorizontalScrollIndicator={false}
          mixedContentMode="always"
        />
      </View>
      <View style={styles.links}>
        {hasQuote && allowHistory ? (
          <Pressable
            onPress={() => {
              webView.current?.injectJavaScript('window.__mailyoToggleQuotes(); true;');
              setQuotesShown((value) => !value);
            }}
            hitSlop={Spacing.sm}
          >
            <AppText variant="caption" weight="semibold" style={linkStyle}>
              {quotesShown ? 'Masquer l’historique' : '••• Historique'}
            </AppText>
          </Pressable>
        ) : null}
        {shrunk ? (
          <Pressable onPress={() => setReader(true)} hitSlop={Spacing.sm} testID="html-zoom">
            <AppText variant="caption" weight="semibold" style={linkStyle}>
              Agrandir
            </AppText>
          </Pressable>
        ) : null}
        {scheme === 'dark' ? (
          <Pressable onPress={() => setOriginal((value) => !value)} hitSlop={Spacing.sm}>
            <AppText variant="caption" weight="semibold" style={linkStyle}>
              {original ? 'Version sombre' : 'Couleurs d’origine'}
            </AppText>
          </Pressable>
        ) : null}
      </View>

      <Modal visible={reader} animationType="slide" onRequestClose={() => setReader(false)}>
        <SafeAreaView style={styles.reader}>
          <View style={[styles.readerBar, { borderBottomColor: colors.border }]}>
            <Pressable
              onPress={() => setReader(false)}
              accessibilityLabel="Fermer"
              hitSlop={Spacing.md}
            >
              <MaterialIcons name="close" size={24} color={colors.text} />
            </Pressable>
            <AppText variant="body" weight="semibold">
              Pincez pour zoomer
            </AppText>
          </View>
          {reader ? (
            <WebView
              originWhitelist={['*']}
              source={readerSource}
              style={styles.webview}
              javaScriptEnabled
              injectedJavaScript={READER_SCRIPT}
              onMessage={onMessage}
              onShouldStartLoadWithRequest={onShouldStartLoad}
              setBuiltInZoomControls
              setDisplayZoomControls={false}
              scalesPageToFit
              mixedContentMode="always"
            />
          ) : null}
        </SafeAreaView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius.md,
    overflow: 'hidden',
  },
  webview: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  links: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.lg,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.sm,
    marginBottom: Spacing.xs,
  },
  bannerText: {
    flex: 1,
  },
  reader: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  readerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
