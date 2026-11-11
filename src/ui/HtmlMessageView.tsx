import { useCallback, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { WebView, type WebViewMessageEvent, type WebViewNavigation } from 'react-native-webview';

import { AppText } from './AppText';
import { openLink } from './open-link';
import { Radius, Spacing, useAppTheme } from './theme';

export interface HtmlMessageViewProps {
  /** Already sanitised HTML (`sanitizeHtml`). */
  html: string;
  /** Offer the quoted-history toggle (off when the parent is already shown). */
  allowHistory?: boolean;
  testID?: string;
}

/**
 * Reports the content height to React Native, shrinks wide (fixed 600px)
 * newsletters to the bubble width, and toggles quoted history on demand.
 * Runs on our own document only: incoming scripts and handlers are already
 * stripped by the sanitiser.
 */
const MEASURE_SCRIPT = `
(function () {
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
    window.ReactNativeWebView.postMessage(JSON.stringify({ height: height, hasQuote: hasQuote }));
  }
  window.__mailyoToggleQuotes = function () {
    document.body.classList.toggle('show-quotes');
    setTimeout(fit, 50);
  };
  window.addEventListener('load', fit);
  Array.prototype.forEach.call(document.images, function (img) { img.addEventListener('load', fit); });
  if (window.ResizeObserver) new ResizeObserver(fit).observe(document.body);
  setTimeout(fit, 30);
})();
true;
`;

function buildDocument(html: string, textColor: string, linkColor: string): string {
  return `<!DOCTYPE html><html><head>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
<style>
  *, *::before, *::after { box-sizing: border-box; }
  html, body { margin: 0; background: transparent; }
  body { padding: 12px 14px; color: ${textColor}; font-family: sans-serif; font-size: 15px;
         line-height: 1.45; word-wrap: break-word; overflow-wrap: anywhere; }
  a { color: ${linkColor}; word-break: break-word; overflow-wrap: anywhere; }
  img { max-width: 100% !important; height: auto !important; }
  /* Mail layouts hard-code 600px tables: let them shrink to the screen. */
  table { border-collapse: collapse; max-width: 100% !important; }
  table[width], td[width], th[width], div[style*="width"] { width: auto !important; }
  td, th, div, p, span { max-width: 100%; overflow-wrap: anywhere; }
  pre { white-space: pre-wrap; }
  blockquote { margin: 0 0 0 8px; padding-left: 8px; border-left: 3px solid rgba(127,127,127,.4); }
  .gmail_quote, blockquote[type=cite], #divRplyFwdMsg, #divRplyFwdMsg ~ *, .yahoo_quoted,
  .moz-cite-prefix, .moz-cite-prefix ~ blockquote { display: none; }
  body.show-quotes .gmail_quote, body.show-quotes blockquote[type=cite],
  body.show-quotes #divRplyFwdMsg, body.show-quotes #divRplyFwdMsg ~ *,
  body.show-quotes .yahoo_quoted, body.show-quotes .moz-cite-prefix,
  body.show-quotes .moz-cite-prefix ~ blockquote { display: block; }
</style></head><body>${html}</body></html>`;
}

/**
 * Faithful rendering of an HTML email (layout, images, tables, links) inside
 * a chat bubble. Emails are designed for light backgrounds, so the content
 * always sits on a white card, even in dark mode.
 */
export function HtmlMessageView({ html, allowHistory = true, testID }: HtmlMessageViewProps) {
  const colors = useAppTheme();
  const webView = useRef<WebView>(null);
  const [height, setHeight] = useState(60);
  const [hasQuote, setHasQuote] = useState(false);
  const [quotesShown, setQuotesShown] = useState(false);

  const source = useMemo(
    () => ({ html: buildDocument(html, '#1f2328', '#0b6bcb'), baseUrl: '' }),
    [html],
  );

  const onMessage = useCallback((event: WebViewMessageEvent) => {
    try {
      const data = JSON.parse(event.nativeEvent.data) as { height?: number; hasQuote?: boolean };
      if (typeof data.height === 'number' && data.height > 0) {
        setHeight(data.height);
      }
      setHasQuote(Boolean(data.hasQuote));
    } catch {
      // Ignore foreign messages.
    }
  }, []);

  // Every navigation away from our inline document is a tapped link.
  const onShouldStartLoad = useCallback((request: WebViewNavigation) => {
    if (request.url.startsWith('about:') || request.url.startsWith('data:')) {
      return true;
    }
    void openLink(request.url);
    return false;
  }, []);

  return (
    <View testID={testID}>
      <View style={[styles.card, { height }]}>
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
            <AppText variant="caption" weight="semibold" style={{ color: colors.link }}>
              {quotesShown ? 'Masquer l’historique' : '••• Historique'}
            </AppText>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.md,
    overflow: 'hidden',
  },
  webview: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  links: {
    flexDirection: 'row',
    gap: Spacing.lg,
  },
});
