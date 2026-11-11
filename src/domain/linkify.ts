/**
 * Split plain text into text / link segments so URLs, `www.` hosts and email
 * addresses can be rendered as tappable links. Pure; never throws.
 */

export type LinkSegment =
  | { type: 'text'; text: string }
  | { type: 'url'; text: string; href: string }
  | { type: 'email'; text: string; href: string };

const LINK = /\b(?:https?:\/\/|www\.)[^\s<>"']+|[\w.+-]+@[\w-]+(?:\.[\w-]+)+/gi;

/** Punctuation that usually ends a sentence rather than the URL. */
const TRAILING = /[.,;:!?)\]}'"»]+$/;

export function linkify(text: string): LinkSegment[] {
  const segments: LinkSegment[] = [];
  let last = 0;
  for (const match of (text ?? '').matchAll(LINK)) {
    let raw = match[0];
    const start = match.index ?? 0;
    // Keep a closing parenthesis only when the URL itself opened one.
    const trailing = raw.match(TRAILING)?.[0] ?? '';
    if (trailing && !(trailing.startsWith(')') && raw.includes('('))) {
      raw = raw.slice(0, raw.length - trailing.length);
    }
    if (raw.length === 0) {
      continue;
    }
    if (start > last) {
      segments.push({ type: 'text', text: text.slice(last, start) });
    }
    if (raw.includes('@') && !/^(https?:\/\/|www\.)/i.test(raw)) {
      segments.push({ type: 'email', text: raw, href: `mailto:${raw}` });
    } else {
      segments.push({
        type: 'url',
        text: raw,
        href: /^https?:\/\//i.test(raw) ? raw : `https://${raw}`,
      });
    }
    last = start + raw.length;
  }
  if (last < (text ?? '').length) {
    segments.push({ type: 'text', text: text.slice(last) });
  }
  return segments;
}
