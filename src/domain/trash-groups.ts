/**
 * The provider trash lists messages one by one. Deleting a conversation of
 * ten mails must show one conversation in the « Corbeille », not ten rows:
 * messages are grouped back into conversations with the same threading rules
 * as the inbox (References / In-Reply-To, then the subject).
 */

import { computeThreadKey, parseMessageIds } from '@/domain/threading';

export interface TrashedItemLike {
  accountId: string;
  remote: {
    messageIdHeader: string | null;
    inReplyTo: string | null;
    referencesHeader: string | null;
    subject: string;
    receivedAt: number;
  };
}

export interface TrashGroup<T extends TrashedItemLike> {
  key: string;
  accountId: string;
  /** Oldest first. */
  items: T[];
  latest: T;
}

export function groupTrashed<T extends TrashedItemLike>(items: T[]): TrashGroup<T>[] {
  const groups = new Map<string, T[]>();
  const knownByAccount = new Map<string, Map<string, string>>();
  // Oldest first, so replies attach to the parent seen before them.
  for (const item of [...items].sort((a, b) => a.remote.receivedAt - b.remote.receivedAt)) {
    const known = knownByAccount.get(item.accountId) ?? new Map<string, string>();
    knownByAccount.set(item.accountId, known);
    const threadKey = computeThreadKey(
      {
        messageIdHeader: item.remote.messageIdHeader,
        inReplyTo: item.remote.inReplyTo,
        referencesHeader: item.remote.referencesHeader,
        subject: item.remote.subject,
      },
      known,
    );
    for (const id of parseMessageIds(item.remote.messageIdHeader)) known.set(id, threadKey);
    const key = `${item.accountId}::${threadKey}`;
    const list = groups.get(key) ?? [];
    list.push(item);
    groups.set(key, list);
  }
  return [...groups.entries()]
    .map(([key, list]) => ({
      key,
      accountId: list[0].accountId,
      items: list,
      latest: list[list.length - 1],
    }))
    .sort((a, b) => b.latest.remote.receivedAt - a.latest.remote.receivedAt);
}
