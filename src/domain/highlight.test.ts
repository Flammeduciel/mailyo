import { excerptAround, highlightSegments } from '@/domain/highlight';

describe('highlight', () => {
  it('marks every term, ignoring case and accents', () => {
    expect(highlightSegments('Réunion de vendredi : RÉUNION annulée', 'reunion')).toEqual([
      { text: 'Réunion', match: true },
      { text: ' de vendredi : ', match: false },
      { text: 'RÉUNION', match: true },
      { text: ' annulée', match: false },
    ]);
  });

  it('handles several terms and no match', () => {
    expect(
      highlightSegments('Plans de la cuisine', 'cuisine plans')
        .filter((s) => s.match)
        .map((s) => s.text),
    ).toEqual(['Plans', 'cuisine']);
    expect(highlightSegments('Bonjour', 'zzz')).toEqual([{ text: 'Bonjour', match: false }]);
    expect(highlightSegments('Bonjour', '  ')).toEqual([{ text: 'Bonjour', match: false }]);
  });

  it('centres the excerpt on the first match', () => {
    const long = `${'blabla '.repeat(30)}le devis final est prêt`;
    const excerpt = excerptAround(long, 'devis', 10, 40);
    expect(excerpt.startsWith('…')).toBe(true);
    expect(excerpt).toContain('devis');
  });
});
