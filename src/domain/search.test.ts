import { buildFtsQuery } from '@/domain/search';

describe('buildFtsQuery', () => {
  it('returns null for empty or separator-only input', () => {
    expect(buildFtsQuery('')).toBeNull();
    expect(buildFtsQuery('   ')).toBeNull();
    expect(buildFtsQuery('***')).toBeNull();
  });

  it('quotes tokens and makes the last one a prefix query', () => {
    expect(buildFtsQuery('quarterly invoice')).toBe('"quarterly" "invoice"*');
  });

  it('keeps email addresses and domains searchable', () => {
    expect(buildFtsQuery('claire@atelier-nord.fr')).toBe('"claire@atelier-nord.fr"*');
  });

  it('strips characters that are meaningful to FTS syntax', () => {
    expect(buildFtsQuery('"NEAR OR AND')).toBe('"near" "or" "and"*');
  });

  it('collapses repeated separators', () => {
    expect(buildFtsQuery('facture   janvier')).toBe('"facture" "janvier"*');
  });
});
