import { linkify } from '@/domain/linkify';
import { findQuotedMessage, parseQuoteBlock, quoteOnlyText, splitQuotedText } from '@/domain/quote';

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

describe('parseQuoteBlock', () => {
  it('turns a Gmail attribution and "> " lines into a readable block', () => {
    const block = parseQuoteBlock(
      'Le sam. 6 juin 2026, 16:06, Euloge Ngouma - Akieni Academy <\neuloge.ngouma@akieni.com> a écrit :\n\n> Bonjour Flamme,\n>\n> Félicitations !\n> > Ancienne citation\n',
    );
    expect(block).toEqual({
      author: 'Euloge Ngouma - Akieni Academy',
      address: 'euloge.ngouma@akieni.com',
      date: 'sam. 6 juin 2026, 16:06',
      text: 'Bonjour Flamme,\n\nFélicitations !\n> Ancienne citation',
    });
  });

  it('parses the English form and quotes without attribution', () => {
    expect(
      parseQuoteBlock('On Mon, Jan 5, 2026 at 9:00 AM Bob <bob@x.com> wrote:\n> Hi'),
    ).toMatchObject({
      author: 'Bob',
      address: 'bob@x.com',
      text: 'Hi',
    });
    expect(parseQuoteBlock('> juste\n> une citation')).toEqual({
      author: null,
      address: null,
      date: null,
      text: 'juste\nune citation',
    });
  });
});

describe('deeply nested Gmail history', () => {
  const history = [
    'Le ven. 6 nov. 2026 à 10:13, Flamme <',
    'f@x.com> a écrit :',
    '',
    '> je suis déjà au boulot',
    '> Bonjour',
    '>',
    '> Le jeu. 5 nov. 2026 à 23:02, Benicia Moussana <',
    '> b@x.com> a écrit :',
    '>',
    '>> Oui je passerai',
    '>>',
    '>> Le jeu. 5 nov. 2026 à',
    '>> 21:55, Flamme <',
    '>> f@x.com> a écrit :',
    '>>',
    '>>> Oui je sais !',
  ].join('\n');

  it('peels every level into an author, a date and plain text', () => {
    const first = parseQuoteBlock(history);
    expect(first.author).toBe('Flamme');
    const firstSplit = splitQuotedText(first.text);
    expect(firstSplit.body).toBe('je suis déjà au boulot\nBonjour');

    const second = parseQuoteBlock(firstSplit.quoted ?? '');
    expect(second).toMatchObject({ author: 'Benicia Moussana', address: 'b@x.com' });
    const secondSplit = splitQuotedText(second.text);
    expect(secondSplit.body).toBe('Oui je passerai');

    // Attribution wrapped over three lines.
    const third = parseQuoteBlock(secondSplit.quoted ?? '');
    expect(third).toMatchObject({ author: 'Flamme', date: 'jeu. 5 nov. 2026 à 21:55' });
    expect(third.text).toBe('Oui je sais !');
  });

  it('parses a block whose attribution line is itself quoted', () => {
    const block = parseQuoteBlock('> Le jeu. 5 nov. 2026, Bob <bob@x.com> a écrit :\n>\n>> Salut');
    expect(block).toMatchObject({ author: 'Bob', text: 'Salut' });
  });
});

describe('quote-only messages and quote targets', () => {
  const quote =
    "Le jeu. 5 nov. 2026 à 17:43, Jonathan Matondo <j@gmail.com> a écrit :\n\n> C'est comment cousin on valide ta proposition fais l'effort de nous\n> envoyer le lien en ligne\n>";

  it('detects a message made only of a quote', () => {
    expect(quoteOnlyText(quote)).toBe(quote);
    expect(quoteOnlyText('> a\n> b')).toBe('> a\n> b');
    expect(quoteOnlyText('Bien reçu')).toBeNull();
    expect(quoteOnlyText(`Bien reçu\n\n${quote}`)).toBeNull();
  });

  it('finds the quoted message in the conversation, despite reflowed lines', () => {
    const messages = [
      {
        id: 'a',
        bodyText:
          "C'est comment cousin on valide ta proposition fais l'effort de nous envoyer le lien en ligne",
      },
      { id: 'b', bodyText: `Bien reçu\n\n${quote}` },
    ];
    expect(findQuotedMessage(quote, messages, 'b')?.id).toBe('a');
    expect(findQuotedMessage('> autre chose', messages)).toBeNull();
  });
});
