import {
  extractDomain,
  formatAddress,
  isSameAddress,
  isSelf,
  parseAddress,
  parseAddressList,
} from '@/domain/mime';

describe('mime address parsing', () => {
  it('parses a named address', () => {
    expect(parseAddress('Alice Dupont <alice@example.com>')).toEqual({
      name: 'Alice Dupont',
      address: 'alice@example.com',
    });
  });

  it('parses a quoted name containing a comma', () => {
    expect(parseAddress('"Dupont, Alice" <alice@example.com>')).toEqual({
      name: 'Dupont, Alice',
      address: 'alice@example.com',
    });
  });

  it('parses a bare address', () => {
    expect(parseAddress('bob@example.com')).toEqual({
      name: 'bob@example.com',
      address: 'bob@example.com',
    });
  });

  it('returns null for an empty token', () => {
    expect(parseAddress('   ')).toBeNull();
  });

  it('splits a list on top-level commas only', () => {
    const list = parseAddressList('Alice <a@x.com>, "B, C" <b@y.com>, c@z.com');
    expect(list.map((entry) => entry.address)).toEqual(['a@x.com', 'b@y.com', 'c@z.com']);
  });

  it('handles null headers', () => {
    expect(parseAddressList(null)).toEqual([]);
  });

  it('formats addresses', () => {
    expect(formatAddress({ name: 'Alice', address: 'a@x.com' })).toBe('Alice <a@x.com>');
    expect(formatAddress({ name: 'a@x.com', address: 'a@x.com' })).toBe('a@x.com');
  });

  it('extracts domains and compares addresses', () => {
    expect(extractDomain('Alice <alice@Example.COM>')).toBe('example.com');
    expect(extractDomain('no-at-sign')).toBe('');
    expect(isSameAddress('A@x.com', 'a@X.COM')).toBe(true);
    expect(isSelf('me@x.com', 'ME@x.com')).toBe(true);
  });
});
