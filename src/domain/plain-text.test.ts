import { splitEmphasis, tidyPlainText } from '@/domain/plain-text';

describe('tidyPlainText', () => {
  it('re-joins lines wrapped mid-sentence', () => {
    expect(
      tidyPlainText(
        'stage chez AKIENI. Finalement au\nmilieu\ndu KO congolais.\nConcernant l’appli',
      ),
    ).toBe('stage chez AKIENI. Finalement au milieu du KO congolais.\nConcernant l’appli');
  });

  it('keeps a URL on its own line', () => {
    expect(tidyPlainText('Lien du meet\nhttps://meet.google.com/abc')).toBe(
      'Lien du meet\nhttps://meet.google.com/abc',
    );
  });

  it('collapses runs of blank lines', () => {
    expect(tidyPlainText('rôle.\n\n\n\nCDLT\r\n\r\n\r\nRod')).toBe('rôle.\n\nCDLT\n\nRod');
  });

  it('drops the repeated target after an address or URL', () => {
    expect(tidyPlainText('*rod.k@gmail.com* <rod.k@gmail.com>')).toBe('*rod.k@gmail.com*');
    expect(tidyPlainText('a@b.fr <mailto:a@b.fr>')).toBe('a@b.fr');
    expect(tidyPlainText('https://x.fr/p <https://x.fr/p>')).toBe('https://x.fr/p');
  });
});

describe('splitEmphasis', () => {
  it('turns *text* into bold segments', () => {
    expect(splitEmphasis('*Rod KOUIKANI*\n*Mobile +33 6*')).toEqual([
      { text: 'Rod KOUIKANI', bold: true },
      { text: '\n', bold: false },
      { text: 'Mobile +33 6', bold: true },
    ]);
  });

  it('leaves arithmetic and lone asterisks alone', () => {
    expect(splitEmphasis('2*3*4 et * seul')).toEqual([{ text: '2*3*4 et * seul', bold: false }]);
  });
});
