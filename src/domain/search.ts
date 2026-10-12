/**
 * Full-text search query builder.
 *
 * SQLite FTS5 `MATCH` has its own grammar (operators, column filters, quotes).
 * User input must never reach it verbatim or a stray `"` or `NEAR` would throw
 * or change the semantics. We tokenise the input, keep letters/numbers (plus
 * `@` and `.` so email addresses stay searchable), wrap every token in double
 * quotes and let the last token be a prefix query — the familiar "search as you
 * type" behaviour.
 */

/** Characters that survive tokenisation: unicode letters/digits, `@`, `.`, `_`, `-`. */
const SEPARATORS = /[^\p{L}\p{N}@._-]+/u;

export function buildFtsQuery(input: string): string | null {
  const tokens = input
    .toLowerCase()
    .split(SEPARATORS)
    .filter((token) => token.length > 0);

  if (tokens.length === 0) {
    return null;
  }

  return tokens
    .map((token, index) => {
      const quoted = `"${token.replace(/"/g, '')}"`;
      return index === tokens.length - 1 ? `${quoted}*` : quoted;
    })
    .join(' ');
}
