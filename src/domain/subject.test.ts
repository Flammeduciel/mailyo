import { hasSubjectPrefix, normalizeSubject, stripSubjectPrefixes } from '@/domain/subject';

describe('subject', () => {
  it('strips common reply and forward prefixes', () => {
    expect(stripSubjectPrefixes('Re: Fwd: RE:   Hello world')).toBe('Hello world');
  });

  it('strips French and localised prefixes', () => {
    expect(stripSubjectPrefixes('Rép : Bonjour')).toBe('Bonjour');
    expect(stripSubjectPrefixes('TR: Bonjour')).toBe('Bonjour');
  });

  it('keeps mailing-list tags', () => {
    expect(normalizeSubject('[projet] Fwd: Suivi')).toBe('[projet] suivi');
  });

  it('normalises case and whitespace', () => {
    expect(normalizeSubject('  HELLO    World ')).toBe('hello world');
  });

  it('detects prefixes', () => {
    expect(hasSubjectPrefix('Re: x')).toBe(true);
    expect(hasSubjectPrefix('Bonjour')).toBe(false);
  });
});
