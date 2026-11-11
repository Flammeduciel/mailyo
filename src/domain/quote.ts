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
 * "Le …, X a écrit :" / "On …, X wrote:" — may wrap over two lines. `[^\S\n]`
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
