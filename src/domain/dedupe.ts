/**
 * Notification de-duplication.
 *
 * The same message can be observed more than once (sync retries, reconnect,
 * provider echoes). A short sliding window keeps a notification from firing
 * twice for the same message id.
 */

export interface DedupeEntry {
  messageId: string;
  notifiedAt: number;
}

/** True when `messageId` was already notified within the last `windowMs`. */
export function shouldDeduplicate(
  messageId: string,
  recent: DedupeEntry[],
  now: number,
  windowMs: number,
): boolean {
  return recent.some((entry) => entry.messageId === messageId && now - entry.notifiedAt < windowMs);
}
