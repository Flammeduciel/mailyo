import { MaterialIcons } from '@expo/vector-icons';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Alert, Modal, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView, type WebViewMessageEvent, type WebViewNavigation } from 'react-native-webview';

import { blockRemoteImages, deceptiveLinkDomain, hostOf } from '@/domain/html-privacy';

import { AppText } from './AppText';
import { buildEmailDocument, FIT_SCRIPT, READER_SCRIPT } from './html-document';
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
    () => ({ html: buildEmailDocument(prepared.html, { dark, reader: false }), baseUrl: '' }),
    [prepared.html, dark],
  );
  const readerSource = useMemo(
    () => ({ html: buildEmailDocument(prepared.html, { dark, reader: true }), baseUrl: '' }),
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
          injectedJavaScript={FIT_SCRIPT}
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
