/**
 * Identifier helpers for the domain and data layers.
 *
 * `deterministicId` is used when the same logical entity must map to the same
 * local id across syncs (idempotency). `createId` is only for entities with no
 * natural key (local drafts, pending operations...).
 */

/** Stable, fast, non-cryptographic string hash (djb2 variant). */
export function hashString(input: string): string {
  let hash = 5381;
  for (let i = 0; i < input.length; i += 1) {
    hash = ((hash << 5) + hash) ^ input.charCodeAt(i);
  }
  // Convert to an unsigned base36 string.
  return (hash >>> 0).toString(36);
}

/** Deterministic id from a set of parts. Collision-safe enough for local keys. */
export function deterministicId(...parts: string[]): string {
  return hashString(parts.join('\u0000'));
}

/** Random id for locally created entities. */
export function createId(prefix = 'id'): string {
  const random = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now().toString(36)}${random}`;
}
