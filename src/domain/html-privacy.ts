/**
 * Privacy and safety helpers for HTML mails: remote images (tracking pixels),
 * deceptive links and List-Unsubscribe.
 */

const REMOTE_IMG = /(<img\b[^>]*?)\ssrc\s*=\s*(["'])(https?:[^"']*)\2/gi;

/**
 * Neutralise remote images: their URL moves to `data-mailyo-src` so nothing
 * is fetched (and no read receipt leaks) until the user asks for images.
 */
export function blockRemoteImages(html: string): { html: string; blocked: number } {
  let blocked = 0;
  const result = html.replace(REMOTE_IMG, (_match, start: string, quote: string, url: string) => {
    blocked += 1;
    return `${start} data-mailyo-src=${quote}${url}${quote}`;
  });
  return { html: result, blocked };
}

/** Host of an http(s) URL without "www.", or null. */
export function hostOf(url: string): string | null {
  const match = /^https?:\/\/([^/?#:]+)/i.exec(url.trim());
  return match ? match[1].toLowerCase().replace(/^www\./, '') : null;
}

/**
 * When the visible text of a link looks like an address on another domain than
 * the real target ("paypal.com" → evil.example), return that displayed domain.
 */
export function deceptiveLinkDomain(text: string, href: string): string | null {
  const target = hostOf(href);
  if (!target) return null;
  const shown = /(?:https?:\/\/)?(?:www\.)?([a-z0-9-]+(?:\.[a-z0-9-]+)+)/i.exec(text.trim());
  if (!shown) return null;
  const displayed = shown[1].toLowerCase();
  if (!/\.[a-z]{2,}$/.test(displayed)) return null;
  const sameSite =
    target === displayed || target.endsWith(`.${displayed}`) || displayed.endsWith(`.${target}`);
  return sameSite ? null : displayed;
}

export interface UnsubscribeTargets {
  url: string | null;
  mailto: string | null;
}

/** Parse `List-Unsubscribe: <mailto:x@y?subject=…>, <https://…>`. */
export function parseListUnsubscribe(header: string | null | undefined): UnsubscribeTargets {
  const targets: UnsubscribeTargets = { url: null, mailto: null };
  if (!header) return targets;
  for (const match of header.matchAll(/<([^>]+)>/g)) {
    const value = match[1].trim();
    if (/^https:\/\//i.test(value) && !targets.url) targets.url = value;
    else if (/^mailto:/i.test(value) && !targets.mailto) targets.mailto = value;
  }
  return targets;
}
