import { groupTrashed } from '@/domain/trash-groups';

function item(
  id: string,
  at: number,
  extra: Partial<{ inReplyTo: string; references: string; subject: string; account: string }> = {},
) {
  return {
    accountId: extra.account ?? 'a',
    remote: {
      messageIdHeader: `<${id}@x>`,
      inReplyTo: extra.inReplyTo ? `<${extra.inReplyTo}@x>` : null,
      referencesHeader: extra.references ? `<${extra.references}@x>` : null,
      subject: extra.subject ?? 'Réunion',
      receivedAt: at,
    },
  };
}

describe('groupTrashed', () => {
  it('puts the mails of one deleted conversation in a single group', () => {
    const groups = groupTrashed([
      item('m3', 3, { inReplyTo: 'm2', references: 'm1' }),
      item('m1', 1),
      item('m2', 2, { inReplyTo: 'm1', references: 'm1' }),
      item('other', 5, { subject: 'Facture' }),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[0].latest.remote.messageIdHeader).toBe('<other@x>');
    expect(groups[1].items.map((i) => i.remote.messageIdHeader)).toEqual([
      '<m1@x>',
      '<m2@x>',
      '<m3@x>',
    ]);
  });

  it('never mixes accounts', () => {
    expect(groupTrashed([item('m1', 1), item('m1', 2, { account: 'b' })])).toHaveLength(2);
  });
});
