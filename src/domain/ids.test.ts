import { createId, deterministicId, hashString } from '@/domain/ids';

describe('ids', () => {
  it('produces a stable hash for the same input', () => {
    expect(hashString('hello')).toBe(hashString('hello'));
  });

  it('produces different hashes for different inputs', () => {
    expect(hashString('hello')).not.toBe(hashString('world'));
  });

  it('builds a deterministic id independent of nothing', () => {
    expect(deterministicId('a', 'b')).toBe(deterministicId('a', 'b'));
    expect(deterministicId('a', 'b')).not.toBe(deterministicId('a', 'c'));
  });

  it('does not collide when parts are joined differently', () => {
    // '\u0000' separator prevents ('ab','c') colliding with ('a','bc').
    expect(deterministicId('ab', 'c')).not.toBe(deterministicId('a', 'bc'));
  });

  it('creates unique ids with a prefix', () => {
    const first = createId('msg');
    const second = createId('msg');
    expect(first).not.toBe(second);
    expect(first.startsWith('msg_')).toBe(true);
  });
});
