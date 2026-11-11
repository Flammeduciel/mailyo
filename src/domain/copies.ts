/**
 * People in copy (Cc) along a conversation: who was added or dropped from one
 * message to the next, so the thread can say « Marc a été ajouté en copie ».
 * People copied from the very first message are simply shown under it.
 */

import type { EmailAddress, Message } from '@/domain/models';

export interface CopyChange {
  added: EmailAddress[];
  removed: EmailAddress[];
}

type Participants = Pick<Message, 'senderAddress' | 'to' | 'cc'>;

function addresses(message: Participants): Set<string> {
  return new Set(
    [
      message.senderAddress,
      ...message.to.map((a) => a.address),
      ...message.cc.map((a) => a.address),
    ]
      .filter(Boolean)
      .map((address) => address.toLowerCase()),
  );
}

/** Changes per message id; messages without change are absent. `self` is never reported. */
export function copyChanges(
  messages: (Participants & { id: string })[],
  self: string,
): Map<string, CopyChange> {
  const me = self.toLowerCase();
  const result = new Map<string, CopyChange>();
  for (let i = 1; i < messages.length; i += 1) {
    const previous = messages[i - 1];
    const current = messages[i];
    const before = addresses(previous);
    const now = addresses(current);
    const added = current.cc.filter(
      (person) => person.address.toLowerCase() !== me && !before.has(person.address.toLowerCase()),
    );
    const removed = previous.cc.filter(
      (person) => person.address.toLowerCase() !== me && !now.has(person.address.toLowerCase()),
    );
    if (added.length > 0 || removed.length > 0) {
      result.set(current.id, { added, removed });
    }
  }
  return result;
}

/** « Marc Dupuis », « Marc Dupuis et Bureau », « Marc, Bureau et 2 autres ». */
export function joinNames(people: EmailAddress[]): string {
  const names = people.map((p) => p.name || p.address);
  if (names.length <= 1) return names[0] ?? '';
  if (names.length === 2) return `${names[0]} et ${names[1]}`;
  if (names.length === 3) return `${names[0]}, ${names[1]} et ${names[2]}`;
  return `${names[0]}, ${names[1]} et ${names.length - 2} autres`;
}
