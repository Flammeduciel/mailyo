import {
  buildForwardBlock,
  composeForwardBody,
  formatPerson,
  forwardSubject,
} from '@/domain/forward';

const original = {
  senderName: 'Euloge Ngouma',
  senderAddress: 'euloge@akieni.com',
  receivedAt: new Date(2026, 5, 6, 16, 6).getTime(),
  subject: 'Rejoins ton groupe',
  to: [{ name: 'flammewassangou@gmail.com', address: 'flammewassangou@gmail.com' }],
  cc: [],
  bodyText: 'Bonjour,\n\nBienvenue !\n',
};

describe('forward', () => {
  it('formats people without repeating the address', () => {
    expect(formatPerson({ name: 'Euloge', address: 'e@a.com' })).toBe('Euloge <e@a.com>');
    expect(formatPerson({ name: 'e@a.com', address: 'e@a.com' })).toBe('e@a.com');
    expect(formatPerson({ name: '', address: 'e@a.com' })).toBe('e@a.com');
  });

  it('prefixes the subject once', () => {
    expect(forwardSubject('Test')).toBe('Tr : Test');
    expect(forwardSubject('Tr : Test')).toBe('Tr : Test');
    expect(forwardSubject('Fwd: Test')).toBe('Fwd: Test');
  });

  it('builds a clean French block under the typed text', () => {
    expect(buildForwardBlock(original)).toBe(
      '---------- Message transféré ----------\n' +
        'De : Euloge Ngouma <euloge@akieni.com>\n' +
        'Date : samedi 6 juin 2026 à 16:06\n' +
        'Objet : Rejoins ton groupe\n' +
        'À : flammewassangou@gmail.com\n\n' +
        'Bonjour,\n\nBienvenue !',
    );
    expect(
      composeForwardBody('  Regarde ça  ', original).startsWith(
        'Regarde ça\n\n---------- Message transféré',
      ),
    ).toBe(true);
    expect(composeForwardBody('', original).startsWith('---------- Message transféré')).toBe(true);
  });
});
