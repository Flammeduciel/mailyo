/**
 * Retry backoff for network operations.
 *
 * Exponential growth from `baseMs`, capped at `capMs`, with symmetric jitter to
 * avoid a thundering herd when many accounts retry at once. `random` is
 * injectable so the schedule stays deterministic under test.
 */

export interface BackoffOptions {
  baseMs: number;
  capMs: number;
  jitterRatio: number;
  random: () => number;
}

export const DEFAULT_BACKOFF: BackoffOptions = {
  baseMs: 1000,
  capMs: 5 * 60 * 1000,
  jitterRatio: 0.2,
  random: Math.random,
};

/**
 * Delay before retrying `attempt` (0-based), in whole milliseconds. The result
 * is bounded to `[0, capMs]` even after jitter is applied.
 */
export function computeBackoffDelay(
  attempt: number,
  options: Partial<BackoffOptions> = {},
): number {
  const { baseMs, capMs, jitterRatio, random } = { ...DEFAULT_BACKOFF, ...options };
  const safeAttempt = Math.max(0, Math.floor(attempt));
  const exponential = baseMs * 2 ** safeAttempt;
  const capped = Math.min(exponential, capMs);
  const jitterFactor = 1 + (random() * 2 - 1) * jitterRatio;
  const jittered = capped * jitterFactor;
  return Math.round(Math.min(Math.max(jittered, 0), capMs));
}

const AUTH_ERROR_SIGNALS = [
  'auth',
  'authentication failed',
  'invalid credentials',
  'invalid_grant',
  '401',
  'unauthorized',
];

/**
 * True when a failure looks like an authentication problem. Auth failures must
 * not be retried aggressively: retrying cannot fix bad credentials and may lock
 * the account, so callers should stop the backoff loop instead.
 */
export function isAuthenticationError(message: string): boolean {
  const lower = message.toLowerCase();
  return AUTH_ERROR_SIGNALS.some((signal) => lower.includes(signal));
}
