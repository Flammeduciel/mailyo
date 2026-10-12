/**
 * Conversation threading.
 *
 * Reference headers are used in priority order (`In-Reply-To`, then
 * `References`), exactly as required by the product plan (§6). The normalised
 * subject is only a last-resort fallback when no header can link a message to an
 * existing conversation.
 */

import { deterministicId } from '@/domain/ids';
import { normalizeSubject } from '@/domain/subject';

export interface ThreadingInput {
  messageIdHeader: string | null;
  inReplyTo: string | null;
  referencesHeader: string | null;
  subject: string;
}

/** Extract message ids (without angle brackets) from a header value. */
export function parseMessageIds(header: string | null | undefined): string[] {
  if (!header) {
    return [];
  }
  const ids: string[] = [];
  const angle = /<([^>]+)>/g;
  let match = angle.exec(header);
  while (match !== null) {
    ids.push(match[1].trim());
    match = angle.exec(header);
  }
  if (ids.length === 0) {
    // Some broken clients omit the angle brackets; fall back to whitespace split.
    for (const token of header.trim().split(/\s+/)) {
      if (token.length > 0 && token.includes('@')) {
        ids.push(token);
      }
    }
  }
  return dedupe(ids);
}

/** Normalise a message id to the `<id>` form used in headers. */
export function formatMessageId(id: string): string {
  const trimmed = id.trim();
  if (trimmed.startsWith('<') && trimmed.endsWith('>')) {
    return trimmed;
  }
  return `<${trimmed.replace(/^<|>$/g, '')}>`;
}

/**
 * Compute the thread key for a message.
 *
 * `knownThreadByMessageId` maps a message-id header value (without brackets) to
 * the thread key it already belongs to. When a parent is found there, the
 * message joins that conversation. Otherwise a new deterministic key is derived
 * from the root reference / own message-id, or from the normalised subject.
 */
export function computeThreadKey(
  input: ThreadingInput,
  knownThreadByMessageId: ReadonlyMap<string, string> = new Map(),
): string {
  const parents = dedupe([
    ...parseMessageIds(input.inReplyTo),
    ...parseMessageIds(input.referencesHeader),
  ]);

  for (const parent of parents) {
    const existing = knownThreadByMessageId.get(parent);
    if (existing) {
      return existing;
    }
  }

  const root = parents[0] ?? parseMessageIds(input.messageIdHeader)[0] ?? null;
  if (root) {
    return `msg:${deterministicId(root)}`;
  }

  const normalized = normalizeSubject(input.subject);
  return `sub:${deterministicId(normalized || '(sans sujet)')}`;
}

/**
 * Scope a thread key to an account so remote identifiers from different
 * providers can never collide in a unified inbox.
 */
export function scopedThreadId(accountId: string, threadKey: string): string {
  return `${accountId}::${threadKey}`;
}

function dedupe(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    if (value.length > 0 && !seen.has(value)) {
      seen.add(value);
      result.push(value);
    }
  }
  return result;
}
