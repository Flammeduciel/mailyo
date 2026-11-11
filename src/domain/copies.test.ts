import { copyChanges, joinNames } from '@/domain/copies';

const me = 'me@x.fr';
const claire = { name: 'Claire', address: 'claire@x.fr' };
const bureau = { name: 'Bureau', address: 'bureau@x.fr' };
const marc = { name: 'Marc', address: 'marc@x.fr' };

describe('copyChanges', () => {
  it('reports people added to or dropped from the copy', () => {
    const changes = copyChanges(
      [
        { id: 'm1', senderAddress: claire.address, to: [{ name: '', address: me }], cc: [] },
        { id: 'm2', senderAddress: me, to: [claire], cc: [bureau] },
        {
          id: 'm3',
          senderAddress: claire.address,
          to: [{ name: '', address: me }],
          cc: [bureau, marc],
        },
        { id: 'm4', senderAddress: me, to: [claire], cc: [marc] },
      ],
      me,
    );
    expect(changes.get('m1')).toBeUndefined();
    expect(changes.get('m2')).toEqual({ added: [bureau], removed: [] });
    expect(changes.get('m3')).toEqual({ added: [marc], removed: [] });
    expect(changes.get('m4')).toEqual({ added: [], removed: [bureau] });
  });

  it('does not report someone moving from "to" to "cc", nor the user', () => {
    const changes = copyChanges(
      [
        {
          id: 'm1',
          senderAddress: claire.address,
          to: [{ name: '', address: me }, bureau],
          cc: [],
        },
        {
          id: 'm2',
          senderAddress: claire.address,
          to: [{ name: '', address: me }],
          cc: [bureau, { name: 'Moi', address: me }],
        },
      ],
      me,
    );
    expect(changes.size).toBe(0);
  });

  it('joins names in French', () => {
    expect(joinNames([marc])).toBe('Marc');
    expect(joinNames([marc, bureau])).toBe('Marc et Bureau');
    expect(joinNames([marc, bureau, claire, claire])).toBe('Marc, Bureau et 2 autres');
  });
});
