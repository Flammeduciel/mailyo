import { historyBubbles, parseAttributionDate } from '@/domain/history-bubbles';

describe('parseAttributionDate', () => {
  it('reads French, English and numeric dates in local time', () => {
    expect(parseAttributionDate('ven. 20 nov. 2026, 11:07')).toBe(
      new Date(2026, 10, 20, 11, 7).getTime(),
    );
    expect(parseAttributionDate('jeu. 5 nov. 2026 à 23:02')).toBe(
      new Date(2026, 10, 5, 23, 2).getTime(),
    );
    expect(parseAttributionDate('Mon, Jan 5, 2026, 9:00 PM')).toBe(
      new Date(2026, 0, 5, 21, 0).getTime(),
    );
    expect(parseAttributionDate('20/11/2026 08:15')).toBe(new Date(2026, 10, 20, 8, 15).getTime());
    expect(parseAttributionDate('hier')).toBeNull();
    expect(parseAttributionDate(null)).toBeNull();
  });
});

const reply = (id: string, body: string, at: number, name = 'Flamme') => ({
  id,
  bodyText: body,
  receivedAt: at,
  senderName: name,
  senderAddress: 'f@x.com',
});

describe('historyBubbles', () => {
  const body = [
    'Mec ?',
    '',
    'Le ven. 20 nov. 2026, 11:07, Flamme WASSANGOU <f@x.com> a écrit :',
    '',
    '> Allo ? T’es là ?',
    '>',
    '> Le ven. 20 nov. 2026, 10:35, Flamme WASSANGOU <f@x.com> a écrit :',
    '>',
    '>> Comment tu vas depuis le temps ?',
  ].join('\n');

  it('turns every missing quoted message into a dated bubble', () => {
    const latest = new Date(2026, 10, 20, 11, 52).getTime();
    const { bubbles, covered } = historyBubbles([reply('m3', body, latest)]);
    expect(bubbles.map((b) => [b.text, b.senderName, b.senderAddress])).toEqual([
      ['Comment tu vas depuis le temps ?', 'Flamme WASSANGOU', 'f@x.com'],
      ['Allo ? T’es là ?', 'Flamme WASSANGOU', 'f@x.com'],
    ]);
    expect(bubbles[0].receivedAt).toBe(new Date(2026, 10, 20, 10, 35).getTime());
    expect(covered.has('m3')).toBe(true);
  });

  it('skips quoted messages the conversation already holds', () => {
    const latest = new Date(2026, 10, 20, 11, 52).getTime();
    const { bubbles } = historyBubbles([
      reply('m1', 'Comment tu vas depuis le temps ?', new Date(2026, 10, 20, 10, 35).getTime()),
      reply('m3', body, latest),
    ]);
    expect(bubbles.map((b) => b.text)).toEqual(['Allo ? T’es là ?']);
  });

  it('never dates a quote after its reply and keeps the order without a date', () => {
    const at = 1_000_000;
    const { bubbles } = historyBubbles([
      reply('m2', 'Oui\n\nLe demain, Awa <a@x.com> a écrit :\n> Tu viens ?', at),
    ]);
    expect(bubbles).toHaveLength(1);
    expect(bubbles[0].receivedAt).toBeLessThan(at);
    expect(bubbles[0].dated).toBe(false);
  });

  it('does not duplicate a history quoted by several replies', () => {
    const first = 'Salut\n\nLe ven. 20 nov. 2026, 10:00, Awa <a@x.com> a écrit :\n> Coucou';
    const second =
      'Ça va ?\n\nLe ven. 20 nov. 2026, 10:05, Moi <m@x.com> a écrit :\n> Salut\n>\n> Le ven. 20 nov. 2026, 10:00, Awa <a@x.com> a écrit :\n>> Coucou';
    const { bubbles } = historyBubbles([
      reply('a', first, new Date(2026, 10, 20, 10, 5).getTime()),
      reply('b', second, new Date(2026, 10, 20, 10, 9).getTime()),
    ]);
    expect(bubbles.map((b) => b.text)).toEqual(['Coucou']);
  });
});
