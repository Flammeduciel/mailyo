/**
 * Separate what someone actually wrote from the quoted history clients append
 * to replies, so a conversation reads like a chat: the bubble shows the new
 * text and the quoted part is folded (plan: "messages tirés").
 *
 * Pure and dependency-free; heuristics cover Gmail, Apple Mail, Outlook and
 * Thunderbird in French and English.
 */

export interface SplitQuote {
  /** The author's own text, trimmed. */
  body: string;
  /** The quoted history (attribution line included), or null when none. */
  quoted: string | null;
}

/**
 * "Le …, X a écrit :" / "On …, X wrote:", may wrap over two lines. `[^\S\n]`
 * also matches the no-break spaces French clients put before the colon.
 */
const ATTRIBUTION =
  /(^|\n)[^\S\n]*((?:Le|On)\b[^\n]{0,200}(?:\n[^\n]{0,200})?(?:a\s+écrit|wrote)[^\S\n]*:)[^\S\n]*(\n|$)/i;

/** Outlook / forwarded headers block. */
const OUTLOOK_SEPARATORS = [
  /(^|\n)[ \t]*-{2,}[ \t]*(?:Original Message|Message d'origine|Forwarded message|Message transféré)[ \t]*-{2,}/i,
  /(^|\n)[ \t]*_{8,}[ \t]*\n[ \t]*(?:De|From)[ \t]*:/i,
  /(^|\n)[ \t]*(?:De|From)[ \t]*:[^\n]+\n[ \t]*(?:Envoyé|Sent|Date)[ \t]*:[^\n]+\n/i,
];

export function splitQuotedText(text: string): SplitQuote {
  const source = (text ?? '').replace(/\r\n/g, '\n');

  let cut = -1;
  const attribution = ATTRIBUTION.exec(source);
  if (attribution) {
    cut = attribution.index + attribution[1].length;
  }
  for (const separator of OUTLOOK_SEPARATORS) {
    const match = separator.exec(source);
    if (match) {
      const index = match.index + match[1].length;
      cut = cut === -1 ? index : Math.min(cut, index);
    }
  }

  // Trailing block of "> " lines without an attribution line.
  if (cut === -1) {
    const lines = source.split('\n');
    let start = lines.length;
    while (start > 0 && /^\s*(>|$)/.test(lines[start - 1])) {
      start -= 1;
    }
    const quotedLines = lines.slice(start).filter((line) => line.trim().startsWith('>'));
    if (quotedLines.length > 0 && start > 0) {
      cut = lines.slice(0, start).join('\n').length;
    }
  }

  if (cut <= 0) {
    // Nothing quoted, or the message is *only* a quote: show it as is.
    return { body: source.trim(), quoted: null };
  }
  const body = source.slice(0, cut).trim();
  const quoted = source.slice(cut).trim();
  return body.length === 0
    ? { body: source.trim(), quoted: null }
    : { body, quoted: quoted || null };
}

/** One quoted message: who wrote it, when, and what (one quoting level removed). */
export interface QuoteBlock {
  /** Display name of the quoted author, when the attribution line gives it. */
  author: string | null;
  address: string | null;
  /** Date as written by the client (« sam. 6 juin 2026, 16:06 »). */
  date: string | null;
  /** Quoted text without its "> " markers; may itself contain older quotes. */
  text: string;
}

const ATTRIBUTION_LINE =
  /^(?:Le|On)\s+(.+),\s*([^,<\n]+?)\s*(?:<\s*([^>\s]+)\s*>)?\s*(?:a\s+écrit|wrote)\s*:?\s*$/i;

/** Remove one level of "> " quoting from every line. */
export function unquoteOnce(text: string): string {
  return text
    .split('\n')
    .map((line) => line.replace(/^[^\S\n]*>[^\S\n]?/, ''))
    .join('\n');
}

/**
 * Turn the quoted history of a reply into a readable block: the attribution
 * line becomes « author · date », the "> " markers disappear. Older quotes
 * inside stay in `text` and can be parsed again (nesting).
 */
export function parseQuoteBlock(quoted: string): QuoteBlock {
  const source = quoted.replace(/\r\n/g, '\n').trim();
  const match = ATTRIBUTION.exec(source);
  let author: string | null = null;
  let address: string | null = null;
  let date: string | null = null;
  let rest = source;
  if (match && match.index + match[1].length === 0) {
    const line = match[2].replace(/\s*\n\s*/g, ' ').trim();
    const parts = ATTRIBUTION_LINE.exec(line);
    if (parts) {
      date = parts[1].trim();
      author = parts[2].trim();
      address = parts[3]?.trim() ?? null;
      // English Gmail: "On Mon, Jan 5, 2026 at 9:00 AM Bob <…> wrote:", the
      // time sits before the name, without a comma.
      const timed = /^(.*\d{1,2}[:h]\d{2}(?:\s*[AP]M)?)\s+(.+)$/i.exec(author);
      if (timed) {
        date = `${date}, ${timed[1]}`;
        author = timed[2];
      }
    }
    rest = source.slice(match.index + match[0].length);
  }
  const text = unquoteOnce(rest)
    .replace(/^\s*\n/, '')
    .replace(/\n{3,}/g, '\n\n')
    .trimEnd();
  return { author, address, date, text };
}

/**
 * A message that is nothing but a quote (someone replied without writing,
 * or forwarded inline): returns the quote so it can be shown as a quote card
 * instead of raw "> " lines; null otherwise.
 */
export function quoteOnlyText(text: string): string | null {
  const source = (text ?? '').replace(/\r\n/g, '\n').trim();
  if (!source) return null;
  if (splitQuotedText(source).quoted) return null;
  const attribution = ATTRIBUTION.exec(source);
  if (attribution && attribution.index + attribution[1].length === 0) return source;
  const lines = source.split('\n').filter((line) => line.trim().length > 0);
  return lines.length > 0 && lines.every((line) => line.trim().startsWith('>')) ? source : null;
}

function normalizeForMatch(value: string): string {
  return value.replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * The message of the conversation a quote comes from: the latest one whose own
 * text starts the quoted text (quotes reflow lines, so spaces are ignored).
 */
export function findQuotedMessage<T extends { id: string; bodyText: string }>(
  quoted: string,
  messages: T[],
  excludeId?: string,
): T | null {
  const block = parseQuoteBlock(quoted);
  const quotedOwn = normalizeForMatch(splitQuotedText(block.text).body);
  if (quotedOwn.length < 4) return null;
  const probe = quotedOwn.slice(0, 60);
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const candidate = messages[i];
    if (candidate.id === excludeId) continue;
    const own = normalizeForMatch(splitQuotedText(candidate.bodyText).body);
    if (own && (own.startsWith(probe) || probe.startsWith(own.slice(0, 60)))) return candidate;
  }
  return null;
}
