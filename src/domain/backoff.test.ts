import { computeBackoffDelay, DEFAULT_BACKOFF, isAuthenticationError } from '@/domain/backoff';

const deterministic = { random: () => 0.5 };

describe('backoff', () => {
  it('grows exponentially from the base delay', () => {
    const options = { baseMs: 1000, capMs: 60000, jitterRatio: 0.2, ...deterministic };
    expect(computeBackoffDelay(0, options)).toBe(1000);
    expect(computeBackoffDelay(1, options)).toBe(2000);
    expect(computeBackoffDelay(2, options)).toBe(4000);
    expect(computeBackoffDelay(3, options)).toBe(8000);
  });

  it('caps the delay at capMs', () => {
    const options = { baseMs: 1000, capMs: 5000, jitterRatio: 0.2, ...deterministic };
    expect(computeBackoffDelay(5, options)).toBe(5000);
    expect(computeBackoffDelay(20, options)).toBe(5000);
  });

  it('is deterministic when random is fixed', () => {
    const options = { baseMs: 1000, capMs: 60000, jitterRatio: 0.2, random: () => 0.5 };
    expect(computeBackoffDelay(4, options)).toBe(computeBackoffDelay(4, options));
    expect(computeBackoffDelay(4, options)).toBe(16000);
  });

  it('keeps jitter within +/- jitterRatio', () => {
    const low = computeBackoffDelay(0, {
      baseMs: 1000,
      capMs: 60000,
      jitterRatio: 0.2,
      random: () => 0,
    });
    const high = computeBackoffDelay(0, {
      baseMs: 1000,
      capMs: 60000,
      jitterRatio: 0.2,
      random: () => 0.999999,
    });
    expect(low).toBe(800);
    expect(high).toBeGreaterThanOrEqual(800);
    expect(high).toBeLessThanOrEqual(1200);
  });

  it('never exceeds the cap after jitter, even at the boundary', () => {
    const delay = computeBackoffDelay(0, {
      baseMs: 5000,
      capMs: 5000,
      jitterRatio: 0.5,
      random: () => 0.999,
    });
    expect(delay).toBeLessThanOrEqual(5000);
    expect(delay).toBeGreaterThanOrEqual(0);
  });

  it('treats a negative attempt as attempt 0', () => {
    const options = { baseMs: 1000, capMs: 60000, jitterRatio: 0, ...deterministic };
    expect(computeBackoffDelay(-5, options)).toBe(computeBackoffDelay(0, options));
    expect(computeBackoffDelay(-5, options)).toBe(1000);
  });

  it('exposes sane defaults', () => {
    expect(DEFAULT_BACKOFF.baseMs).toBe(1000);
    expect(DEFAULT_BACKOFF.capMs).toBe(300000);
    expect(DEFAULT_BACKOFF.jitterRatio).toBe(0.2);
    expect(typeof DEFAULT_BACKOFF.random).toBe('function');
  });

  it('flags authentication failures as non-retryable', () => {
    expect(isAuthenticationError('Authentication failed')).toBe(true);
    expect(isAuthenticationError('invalid_grant: token expired')).toBe(true);
    expect(isAuthenticationError('401 Unauthorized')).toBe(true);
    expect(isAuthenticationError('Invalid Credentials')).toBe(true);
  });

  it('does not flag transient network failures', () => {
    expect(isAuthenticationError('network timeout')).toBe(false);
    expect(isAuthenticationError('connexion au serveur perdue')).toBe(false);
    expect(isAuthenticationError('ECONNRESET')).toBe(false);
  });
});
