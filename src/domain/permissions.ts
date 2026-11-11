/** Human labels for the OAuth scopes an account granted. */

export interface PermissionTag {
  label: string;
  granted: boolean;
}

const KNOWN_SCOPES: { scopes: string[]; label: string }[] = [
  { scopes: ['https://mail.google.com/'], label: 'Mails : lecture et envoi' },
  { scopes: ['https://www.googleapis.com/auth/gmail.readonly'], label: 'Mails : lecture' },
  { scopes: ['https://www.googleapis.com/auth/gmail.send'], label: 'Envoi de mails' },
  {
    scopes: ['https://www.googleapis.com/auth/userinfo.email', 'email'],
    label: 'Adresse e-mail',
  },
  { scopes: ['https://www.googleapis.com/auth/contacts.readonly'], label: 'Contacts' },
  { scopes: ['https://www.googleapis.com/auth/contacts.other.readonly'], label: 'Autres contacts' },
];

/** Scopes the app asks for whose absence the user should see. */
const EXPECTED_GMAIL: { scope: string; label: string }[] = [
  { scope: 'https://www.googleapis.com/auth/contacts.readonly', label: 'Contacts' },
  { scope: 'https://www.googleapis.com/auth/contacts.other.readonly', label: 'Autres contacts' },
];

/** Granted permissions first, then the expected ones that are missing. */
export function describePermissions(scope: string | null | undefined): PermissionTag[] {
  const granted = new Set((scope ?? '').split(/\s+/).filter(Boolean));
  const tags: PermissionTag[] = KNOWN_SCOPES.filter((known) =>
    known.scopes.some((candidate) => granted.has(candidate)),
  ).map((known) => ({ label: known.label, granted: true }));
  for (const expected of EXPECTED_GMAIL) {
    if (!granted.has(expected.scope)) {
      tags.push({ label: expected.label, granted: false });
    }
  }
  return tags;
}
