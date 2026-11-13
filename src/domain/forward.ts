/**
 * Forwarding: subject prefix and the « Message transféré » block appended to
 * the new message, in clean French (accents, one address per person).
 */

import type { EmailAddress, Message } from '@/domain/models';

/** « Euloge Ngouma <euloge@akieni.com> », or just the address when there is no name. */
export function formatPerson(person: EmailAddress): string {
  const name = person.name.trim();
  return name && name.toLowerCase() !== person.address.toLowerCase()
    ? `${name} <${person.address}>`
    : person.address;
}

/** « Tr : Sujet », without stacking prefixes. */
export function forwardSubject(subject: string): string {
  return /^\s*(tr|fwd?)\s*:/i.test(subject) ? subject : `Tr : ${subject || '(Sans objet)'}`;
}

/** « samedi 6 juin 2026 à 16:06 » */
export function formatForwardDate(timestamp: number): string {
  const date = new Date(timestamp);
  const days = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
  const months = [
    'janvier',
    'février',
    'mars',
    'avril',
    'mai',
    'juin',
    'juillet',
    'août',
    'septembre',
    'octobre',
    'novembre',
    'décembre',
  ];
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${days[date.getDay()]} ${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()} à ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

type Forwarded = Pick<
  Message,
  'senderName' | 'senderAddress' | 'receivedAt' | 'subject' | 'to' | 'cc' | 'bodyText'
>;

/** The block appended under what the user wrote. */
export function buildForwardBlock(message: Forwarded): string {
  const lines = [
    '---------- Message transféré ----------',
    `De : ${formatPerson({ name: message.senderName, address: message.senderAddress })}`,
    `Date : ${formatForwardDate(message.receivedAt)}`,
    `Objet : ${message.subject || '(Sans objet)'}`,
  ];
  if (message.to.length > 0) lines.push(`À : ${message.to.map(formatPerson).join(', ')}`);
  if (message.cc.length > 0) lines.push(`Cc : ${message.cc.map(formatPerson).join(', ')}`);
  return `${lines.join('\n')}\n\n${message.bodyText.trim()}`;
}

/** What is actually sent: the user's text, then the forwarded message. */
export function composeForwardBody(typed: string, message: Forwarded): string {
  const own = typed.trim();
  return own ? `${own}\n\n${buildForwardBlock(message)}` : buildForwardBlock(message);
}
