/**
 * Search highlighting: which parts of a text match the query terms, ignoring
 * case and accents (« reunion » finds « Réunion »), and an excerpt centred on
 * the first match so it is visible in a one-line preview.
 */

export interface TextSegment {
  text: string;
  match: boolean;
}

/** Lower-case, accent-free version of one character (same length mapping). */
function fold(char: string): string {
  const base = char.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  return base.length === 1 ? base : char.toLowerCase().slice(0, 1) || char;
}

export function searchTerms(query: string): string[] {
  return [
    ...new Set(
      query
        .split(/\s+/)
        .map((term) => [...term].map(fold).join(''))
        .filter((term) => term.length > 0),
    ),
  ].sort((a, b) => b.length - a.length);
}

export function highlightSegments(text: string, query: string): TextSegment[] {
  const terms = searchTerms(query);
  const chars = [...text];
  if (terms.length === 0 || chars.length === 0) return [{ text, match: false }];
  const folded = chars.map(fold).join('');
  const marked = new Array<boolean>(chars.length).fill(false);
  for (const term of terms) {
    let from = 0;
    for (;;) {
      const at = folded.indexOf(term, from);
      if (at < 0) break;
      for (let i = at; i < at + term.length; i += 1) marked[i] = true;
      from = at + term.length;
    }
  }
  const segments: TextSegment[] = [];
  chars.forEach((char, i) => {
    const last = segments[segments.length - 1];
    if (last && last.match === marked[i]) last.text += char;
    else segments.push({ text: char, match: marked[i] });
  });
  return segments;
}

/** The text around the first match (single line), with « … » where it was cut. */
export function excerptAround(text: string, query: string, before = 24, length = 140): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  const terms = searchTerms(query);
  const folded = [...flat].map(fold).join('');
  const hits = terms.map((term) => folded.indexOf(term)).filter((at) => at >= 0);
  if (hits.length === 0) return flat.slice(0, length);
  const start = Math.max(0, Math.min(...hits) - before);
  const chars = [...flat];
  const excerpt = chars.slice(start, start + length).join('');
  return `${start > 0 ? '…' : ''}${excerpt}${start + length < chars.length ? '…' : ''}`;
}
