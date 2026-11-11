import { linkify } from '@/domain/linkify';
import { splitQuotedText } from '@/domain/quote';

describe('splitQuotedText with French no-break spaces', () => {
  it('detects a wrapped Gmail attribution with a no-break space before the colon', () => {
    const quoted =
      'Le ven. 6 nov. 2026 à 21:38, Benicia Moussana <\nb@gmail.com> a écrit :\n\n> Malheureusement';
    expect(splitQuotedText(`+242 06 689 3975\n\n${quoted}`)).toEqual({
      body: '+242 06 689 3975',
      quoted,
    });
  });
});

describe('splitQuotedText', () => {
  it('folds Gmail French history, including a wrapped attribution line', () => {
    const text =
      'Parfait, à demain !\n\nLe mar. 10 nov. 2026 à 14:03, Alice Martin <alice@example.com>\na écrit :\n> On se voit à 10h ?';
    expect(splitQuotedText(text)).toEqual({
      body: 'Parfait, à demain !',
      quoted:
        'Le mar. 10 nov. 2026 à 14:03, Alice Martin <alice@example.com>\na écrit :\n> On se voit à 10h ?',
    });
  });

  it('folds English and Outlook history', () => {
    expect(splitQuotedText('Sure.\n\nOn Tue, Nov 10, 2026 Bob wrote:\n> ok?').body).toBe('Sure.');
    expect(
      splitQuotedText('Vu.\n\nDe : Bob <b@x.fr>\nEnvoyé : mardi 10 novembre\nObjet : test').body,
    ).toBe('Vu.');
  });

  it('folds a trailing block of > lines without attribution', () => {
    expect(splitQuotedText('Oui\n\n> question\n> suite')).toEqual({
      body: 'Oui',
      quoted: '> question\n> suite',
    });
  });

  it('leaves unquoted or quote-only text untouched', () => {
    expect(splitQuotedText('Bonjour\nà tous')).toEqual({ body: 'Bonjour\nà tous', quoted: null });
    expect(splitQuotedText('> seulement une citation').quoted).toBeNull();
  });
});

describe('linkify', () => {
  it('finds urls, www hosts and emails, trimming sentence punctuation', () => {
    expect(linkify('Voir https://ex.com/a?b=1. Ou www.site.fr, ou écrire à a.b@ex.org!')).toEqual([
      { type: 'text', text: 'Voir ' },
      { type: 'url', text: 'https://ex.com/a?b=1', href: 'https://ex.com/a?b=1' },
      { type: 'text', text: '. Ou ' },
      { type: 'url', text: 'www.site.fr', href: 'https://www.site.fr' },
      { type: 'text', text: ', ou écrire à ' },
      { type: 'email', text: 'a.b@ex.org', href: 'mailto:a.b@ex.org' },
      { type: 'text', text: '!' },
    ]);
  });

  it('keeps balanced parentheses in urls', () => {
    expect(linkify('(https://fr.wikipedia.org/wiki/A_(B))')[1]).toMatchObject({
      text: 'https://fr.wikipedia.org/wiki/A_(B))',
    });
  });
});
