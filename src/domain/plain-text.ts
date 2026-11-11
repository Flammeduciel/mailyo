/**
 * Display clean-up for plain-text email bodies, which senders' clients
 * hard-wrap at ~76 columns and decorate with `*bold*` and `text <url>` pairs.
 */

const DUPLICATED_TARGET =
  /([\w.+-]+@[\w-]+(?:\.[\w-]+)+|https?:\/\/[^\s<>*]+)(\*?)\s*<(?:mailto:)?\1>/gi;

/**
 * - drops the `<target>` repeat after an address or URL;
 * - re-joins lines that were wrapped mid-sentence (next line starts lower-case);
 * - collapses runs of blank lines to one.
 */
export function tidyPlainText(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(DUPLICATED_TARGET, '$1$2')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/([^\n])\n(?!https?:|www\.)(?=[a-zà-ÿ])/g, '$1 ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export interface EmphasisSegment {
  text: string;
  bold: boolean;
}

const EMPHASIS = /(^|[\s(<"'«])\*([^*\n]+?)\*(?=$|[\s.,;:!?)>"'»])/g;

/** Splits `*bold*` markers (as Gmail writes bold in plain text) into segments. */
export function splitEmphasis(text: string): EmphasisSegment[] {
  const segments: EmphasisSegment[] = [];
  let last = 0;
  for (const match of text.matchAll(EMPHASIS)) {
    const start = (match.index ?? 0) + match[1].length;
    if (start > last) {
      segments.push({ text: text.slice(last, start), bold: false });
    }
    segments.push({ text: match[2], bold: true });
    last = start + match[2].length + 2;
  }
  if (last < text.length) {
    segments.push({ text: text.slice(last), bold: false });
  }
  return segments;
}
