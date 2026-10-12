/**
 * Subject normalisation, used as a *fallback* for conversation threading.
 *
 * The reference headers (Message-ID / In-Reply-To / References) always take
 * precedence; see `src/domain/threading.ts`. This module only produces a stable
 * key when no usable header exists.
 */

const PREFIX_PATTERN =
  /^(?:re|r[eé]p|r[eé]|fwd?|fw|tr|tr[ae]|aw|sv|vs|antw)\s*(?:\[\d+\])?\s*:\s*/i;
const LIST_TAG_PATTERN = /^\s*(\[[^\]]*\]\s*)/;

/** Remove every leading reply/forward prefix ("Re:", "Fwd:", "TR:", ...). */
export function stripSubjectPrefixes(subject: string): string {
  let current = subject ?? '';
  // Bound the loop defensively: each iteration strictly removes characters.
  for (let guard = 0; guard < 20; guard += 1) {
    const tagMatch = current.match(LIST_TAG_PATTERN);
    const tag = tagMatch ? tagMatch[1] : '';
    const rest = tagMatch ? current.slice(tag.length) : current;
    const prefixMatch = rest.match(PREFIX_PATTERN);
    if (!prefixMatch) {
      break;
    }
    current = tag + rest.slice(prefixMatch[0].length);
  }
  return current;
}

/**
 * Normalised subject used for grouping: prefixes removed, lower-cased,
 * whitespace collapsed, mailing-list tags `[tag]` kept (they are meaningful).
 */
export function normalizeSubject(subject: string): string {
  return stripSubjectPrefixes(subject).replace(/\s+/g, ' ').trim().toLowerCase();
}

/** Whether a subject already carries a reply/forward prefix. */
export function hasSubjectPrefix(subject: string): boolean {
  return PREFIX_PATTERN.test(subject ?? '');
}
