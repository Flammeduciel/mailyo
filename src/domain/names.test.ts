import { meaningfulName, NameBook } from '@/domain/names';

const row = (senderName: string, senderAddress: string, to: [string, string][] = []) => ({
  senderName,
  senderAddress,
  to: to.map(([name, address]) => ({ name, address })),
  cc: [],
});

describe('NameBook', () => {
  it('prefers the name the person uses over Google « other contacts » placeholders', () => {
    const book = NameBook.fromRows([row('Flamme WASSANGOU', 'f2004@gmail.com')]);
    expect(
      book.resolve('F2004@gmail.com', { otherName: 'Nom du destinataire', headerName: '' }),
    ).toBe('Flamme WASSANGOU');
  });

  it('keeps the saved contact name first', () => {
    const book = NameBook.fromRows([row('Flamme W.', 'f@x.fr')]);
    expect(book.resolve('f@x.fr', { savedName: 'Flamme (perso)' })).toBe('Flamme (perso)');
  });

  it('fills a missing name from another mail of the same person, latest wins', () => {
    const book = NameBook.fromRows([
      row('Claire D', 'claire@x.fr'),
      row('', 'claire@x.fr'),
      row('Claire Dupont', 'claire@x.fr'),
    ]);
    expect(book.resolve('claire@x.fr', { headerName: 'claire@x.fr' })).toBe('Claire Dupont');
  });

  it('falls back to names seen in To lines, then to nothing', () => {
    const book = NameBook.fromRows([row('Moi', 'moi@x.fr', [['Paul Martin', 'paul@x.fr']])]);
    expect(book.resolve('paul@x.fr')).toBe('Paul Martin');
    expect(book.resolve('inconnu@x.fr')).toBe('');
  });

  it('ignores names that are only an address', () => {
    expect(meaningfulName('"a@b.fr"', 'a@b.fr')).toBe('');
    expect(meaningfulName('other@b.fr', 'a@b.fr')).toBe('');
    expect(meaningfulName(' "Jean" ', 'a@b.fr')).toBe('Jean');
  });
});
