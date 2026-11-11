import { firstToOpen, groupThreadsByContact } from '@/domain/grouping';
import type { ThreadSummary } from '@/domain/models';

function thread(id: string, address: string, at: number, extra: Partial<ThreadSummary> = {}): ThreadSummary {
  return {
    id,
    accountId: 'a',
    normalizedSubject: id,
    lastMessageAt: at,
    unreadCount: 0,
    isPinned: false,
    isArchived: false,
    messageCount: 1,
    hasAttachments: false,
    isStarred: false,
    contact: { name: address, address },
    lastMessage: { senderName: '', senderAddress: address, subject: id, bodyText: '', receivedAt: at },
    ...extra,
  };
}

describe('groupThreadsByContact', () => {
  it('gathers every subject with the same person under one row', () => {
    const groups = groupThreadsByContact([
      thread('t1', 'bob@x.fr', 10),
      thread('t2', 'alice@x.fr', 30),
      thread('t3', 'BOB@x.fr', 20, { unreadCount: 2, hasAttachments: true }),
    ]);
    expect(groups.map((g) => g.key)).toEqual(['alice@x.fr', 'bob@x.fr']);
    const bob = groups[1];
    expect(bob.threads.map((t) => t.id)).toEqual(['t3', 't1']);
    expect(bob.lead.id).toBe('t3');
    expect(bob.unreadCount).toBe(2);
    expect(bob.hasAttachments).toBe(true);
  });

  it('keeps pinned people first and opens the unread subject first', () => {
    const groups = groupThreadsByContact([
      thread('t1', 'bob@x.fr', 10, { isPinned: true }),
      thread('t2', 'alice@x.fr', 30),
      thread('t3', 'bob@x.fr', 5, { unreadCount: 1 }),
    ]);
    expect(groups[0].key).toBe('bob@x.fr');
    expect(firstToOpen(groups[0]).id).toBe('t3');
  });
});
