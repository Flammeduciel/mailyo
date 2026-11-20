import { historyBubbles } from '@/domain/history-bubbles';
import { quoteOnlyText, splitQuotedText } from '@/domain/quote';

const F = 'Flamme Du Ciel WASSANGOU <\nflammewassangou@gmail.com>';
const B = 'Benicia Moussana <\nmoussanabenicia@gmail.com>';
const q = (text: string) =>
  text
    .split('\n')
    .map((l) => (l.startsWith('>') ? '>' + l : '> ' + l).replace(/^> $/, '>'))
    .join('\n');
function reply(own: string, attribution: string, quoted: string) {
  return `${own}\n\n${attribution} a écrit :\n\n${q(quoted)}\n`;
}
const t = (d: number, h: number, m: number) => new Date(2026, 10, d, h, m).getTime();

const hello = 'Hello tu es partie avec ma machine 😭';
const ouiJeSais = reply(
  "Oui je sais !\nOn fait comment alors ?\nTon stand-up c'est à 15h, tu vas passer prendre ta machine le matin ?",
  `Le jeu. 5 nov. 2026 à 21:09, ${B}`,
  hello,
);
const ouiJePasserai = reply('Oui je passerai', `Le jeu. 5 nov. 2026 à 21:55, ${F}`, ouiJeSais);
const tuPrends = reply(
  'Tu prends ton bus pour aller au boulot où?',
  `Le jeu. 5 nov. 2026 à 23:02, ${B}`,
  ouiJePasserai,
);
const boulot = reply(
  'je suis déjà au boulot\nBonjour',
  `Le jeu. 5 nov. 2026 à 23:02, ${B}`,
  tuPrends,
);
const a13h = reply('À 13h', `Le ven. 6 nov. 2026 à 10:13, ${F}`, boulot);
const depose = reply('oui je le dépose là bas', `Le ven. 6 nov. 2026 à 10:15, ${B}`, a13h);
const merci = reply('Merci très cher', `Le ven. 6 nov. 2026 à 10:16, ${F}`, depose);
const bisou = reply('Bisou', `Le ven. 6 nov. 2026 à 10:20, ${B}`, merci);
const scanne = reply('Tu as scanné mon WhatsApp ?', `Le ven. 6 nov. 2026 à 10:21, ${F}`, bisou);
const demande = `On demande d'abord\n\nLe ven. 6 nov. 2026 à 10:57, Benicia Moussana <moussanabenicia@gmail.com> a écrit :\n\n${q(scanne)}\n`;

const msg = (id: string, body: string, at: number, name: string) => ({
  id,
  bodyText: body,
  receivedAt: at,
  senderName: name,
  senderAddress: name === 'F' ? 'flammewassangou@gmail.com' : 'moussanabenicia@gmail.com',
});

/**
 * A long back-and-forth answered by mail: most messages only live in the
 * quoted history of the replies on the phone (shape of a real conversation).
 */
describe('a conversation rebuilt from its quoted history', () => {
  const messages = [
    msg('ouiJeSais', ouiJeSais, t(5, 21, 55), 'F'),
    msg('boulot', boulot, t(6, 10, 13), 'F'),
    msg('depose', depose, t(6, 10, 16), 'F'),
    msg('bisou', bisou, t(6, 10, 21), 'F'),
    msg('scanne', scanne, t(6, 10, 57), 'B'),
    msg('demande', demande, t(6, 11, 1), 'B'),
    // Short real replies must not hide longer quoted messages.
    msg('oui', 'Oui', t(6, 14, 0), 'B'),
    msg('hello', 'Hello', t(6, 14, 1), 'B'),
  ];

  it('shows every missing message once, in order, with its author', () => {
    const { bubbles } = historyBubbles(messages);
    expect(bubbles.map((b) => b.text)).toEqual([
      hello,
      'Oui je passerai',
      'Tu prends ton bus pour aller au boulot où?',
      'À 13h',
      'Merci très cher',
    ]);
    expect(new Set(bubbles.map((b) => b.senderName))).toEqual(new Set(['Benicia Moussana']));
    expect(bubbles[0].receivedAt).toBe(t(5, 21, 9));
  });

  it('folds every history away once it is all on screen', () => {
    const { covered } = historyBubbles(messages);
    for (const id of ['demande', 'scanne', 'bisou', 'depose', 'boulot', 'ouiJeSais']) {
      expect(covered.has(id)).toBe(true);
    }
  });

  it('keeps « On demande d’abord » as the author’s own text', () => {
    expect(splitQuotedText(demande).body).toBe('On demande d’abord'.replace('’', "'"));
    expect(quoteOnlyText(demande)).toBeNull();
  });
});
