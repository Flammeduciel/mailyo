/**
 * The HTML document an email is shown in, and the script that fits it to the
 * screen. Dependency-free so the exact same code can be checked in a desktop
 * browser at phone width.
 *
 * Fitting works like Gmail: the mail is laid out at the width it was designed
 * for (often 600–700 px), then the whole page is scaled down to the screen
 * width. Its own layout is never altered, so nothing is cut on the right and
 * columns stay aligned.
 */

/**
 * Reports the content height, scales wide mails down to the viewport, toggles
 * quoted history and routes link taps through React Native.
 */
export const FIT_SCRIPT = `
(function () {
  var post = function (data) { window.ReactNativeWebView.postMessage(JSON.stringify(data)); };
  var root = document.getElementById('mailyo-root');
  var last = '';
  function fit() {
    if (!root) return;
    root.style.transform = '';
    root.style.width = '';
    var viewport = document.documentElement.clientWidth || window.innerWidth;
    // Natural width: the widest thing the mail lays out (fixed tables, images…).
    var natural = Math.max(root.scrollWidth, root.offsetWidth);
    var scale = 1;
    if (natural > viewport + 1) {
      scale = viewport / natural;
      root.style.width = natural + 'px';
      root.style.transform = 'scale(' + scale + ')';
    }
    var height = Math.ceil(root.scrollHeight * scale);
    var hasQuote = !!document.querySelector('.gmail_quote, blockquote[type=cite], #divRplyFwdMsg, .yahoo_quoted, .moz-cite-prefix');
    var key = height + '|' + scale + '|' + hasQuote;
    if (key === last) return;
    last = key;
    post({ type: 'size', height: height, hasQuote: hasQuote, shrunk: scale < 0.98, scale: scale });
  }
  window.__mailyoFit = fit;
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
  window.addEventListener('resize', fit);
  Array.prototype.forEach.call(document.images, function (img) { img.addEventListener('load', fit); });
  if (window.ResizeObserver && root) new ResizeObserver(function () { fit(); }).observe(root);
  setTimeout(fit, 30);
  setTimeout(fit, 400);
})();
true;
`;

/** Full-screen reader: no shrinking, real pinch-zoom and horizontal scroll. */
export const READER_SCRIPT = `
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

export interface EmailDocumentOptions {
  /** Invert colours for dark mode (pictures keep theirs). */
  dark: boolean;
  /** Full-screen reader: pinch-zoom allowed, no scaling script. */
  reader: boolean;
}

export function buildEmailDocument(html: string, options: EmailDocumentOptions): string {
  const viewport = options.reader
    ? 'width=device-width, initial-scale=1, minimum-scale=0.25, maximum-scale=5, user-scalable=yes'
    : 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no';
  // Mails are designed for white backgrounds: in dark mode the whole page is
  // inverted, then pictures are inverted back so they keep their colours.
  const dark = options.dark
    ? `html { filter: invert(1) hue-rotate(180deg); background: #fff; }
       img, video, picture, [style*="background-image"] { filter: invert(1) hue-rotate(180deg); }`
    : '';
  return `<!DOCTYPE html><html><head>
<meta charset="utf-8">
<meta name="viewport" content="${viewport}">
<style>
  html, body { margin: 0; padding: 0; background: #fff; overflow-x: hidden; }
  body { overflow-x: hidden; -webkit-text-size-adjust: 100%; }
  #mailyo-root { transform-origin: 0 0; padding: 12px 14px; color: #1f2328;
                 font-family: sans-serif; font-size: 15px; line-height: 1.45;
                 overflow-wrap: break-word; }
  a { color: #0b6bcb; }
  /* Plain mails (no layout of their own): long links and words wrap. */
  #mailyo-root > p a, #mailyo-root > div > a { word-break: break-word; }
  img { max-width: 100%; height: auto; }
  img[data-mailyo-src] { display: none; }
  pre { white-space: pre-wrap; }
  blockquote { margin: 0 0 0 8px; padding-left: 10px; border-left: 3px solid rgba(127,127,127,.35); color: #57606a; }
  .gmail_quote, blockquote[type=cite], #divRplyFwdMsg, #divRplyFwdMsg ~ *, .yahoo_quoted,
  .moz-cite-prefix, .moz-cite-prefix ~ blockquote { display: none; }
  body.show-quotes .gmail_quote, body.show-quotes blockquote[type=cite],
  body.show-quotes #divRplyFwdMsg, body.show-quotes #divRplyFwdMsg ~ *,
  body.show-quotes .yahoo_quoted, body.show-quotes .moz-cite-prefix,
  body.show-quotes .moz-cite-prefix ~ blockquote { display: block; }
  ${dark}
</style></head><body><div id="mailyo-root">${html}</div></body></html>`;
}
