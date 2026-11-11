import { describePermissions } from '@/domain/permissions';

describe('describePermissions', () => {
  it('labels granted scopes and flags missing contact access', () => {
    expect(
      describePermissions('https://mail.google.com/ https://www.googleapis.com/auth/userinfo.email openid'),
    ).toEqual([
      { label: 'Mails : lecture et envoi', granted: true },
      { label: 'Adresse e-mail', granted: true },
      { label: 'Contacts', granted: false },
      { label: 'Autres contacts', granted: false },
    ]);
  });

  it('marks contact access as granted when present', () => {
    expect(
      describePermissions(
        'https://www.googleapis.com/auth/contacts.readonly https://www.googleapis.com/auth/contacts.other.readonly',
      ),
    ).toEqual([
      { label: 'Contacts', granted: true },
      { label: 'Autres contacts', granted: true },
    ]);
  });

  it('handles an unknown scope string', () => {
    expect(describePermissions(null)).toEqual([
      { label: 'Contacts', granted: false },
      { label: 'Autres contacts', granted: false },
    ]);
  });
});
