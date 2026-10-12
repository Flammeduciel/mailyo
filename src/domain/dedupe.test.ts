import { shouldDeduplicate, type DedupeEntry } from '@/domain/dedupe';

const WINDOW = 5000;

describe('dedupe', () => {
  it('returns false for an empty list', () => {
    expect(shouldDeduplicate('msg-1', [], 10000, WINDOW)).toBe(false);
  });

  it('suppresses a repeat inside the window', () => {
    const recent: DedupeEntry[] = [{ messageId: 'msg-1', notifiedAt: 8000 }];
    expect(shouldDeduplicate('msg-1', recent, 10000, WINDOW)).toBe(true);
  });

  it('allows a repeat once the window has elapsed', () => {
    const recent: DedupeEntry[] = [{ messageId: 'msg-1', notifiedAt: 1000 }];
    expect(shouldDeduplicate('msg-1', recent, 7000, WINDOW)).toBe(false);
  });

  it('does not suppress a different message id', () => {
    const recent: DedupeEntry[] = [{ messageId: 'msg-1', notifiedAt: 8000 }];
    expect(shouldDeduplicate('msg-2', recent, 10000, WINDOW)).toBe(false);
  });

  it('treats the window boundary as expired', () => {
    const recent: DedupeEntry[] = [{ messageId: 'msg-1', notifiedAt: 5000 }];
    expect(shouldDeduplicate('msg-1', recent, 10000, WINDOW)).toBe(false);
  });

  it('finds the matching entry among several', () => {
    const recent: DedupeEntry[] = [
      { messageId: 'msg-1', notifiedAt: 1000 },
      { messageId: 'msg-2', notifiedAt: 9000 },
    ];
    expect(shouldDeduplicate('msg-2', recent, 10000, WINDOW)).toBe(true);
  });
});
