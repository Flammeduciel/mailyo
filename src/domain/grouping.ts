/**
 * Chat-style list: one row per person. Every conversation (subject) with the
 * same correspondent is gathered under that person; pinned groups stay first,
 * then the most recent activity.
 */

import type { ThreadSummary } from '@/domain/models';

export interface ContactGroup {
  /** Lower-cased address of the correspondent. */
  key: string;
  /** Most recent conversation: drives the row (name, preview, time). */
  lead: ThreadSummary;
  /** Every conversation with this person, most recent first. */
  threads: ThreadSummary[];
  unreadCount: number;
  isPinned: boolean;
  isStarred: boolean;
  hasAttachments: boolean;
}

export function contactKey(thread: ThreadSummary): string {
  return (thread.contact.address || thread.id).toLowerCase();
}

export function groupThreadsByContact(threads: ThreadSummary[]): ContactGroup[] {
  const byKey = new Map<string, ThreadSummary[]>();
  for (const thread of threads) {
    const key = contactKey(thread);
    const list = byKey.get(key);
    if (list) list.push(thread);
    else byKey.set(key, [thread]);
  }
  const groups: ContactGroup[] = [];
  for (const [key, list] of byKey) {
    const sorted = [...list].sort((a, b) => b.lastMessage.receivedAt - a.lastMessage.receivedAt);
    groups.push({
      key,
      lead: sorted[0],
      threads: sorted,
      unreadCount: sorted.reduce((sum, t) => sum + t.unreadCount, 0),
      isPinned: sorted.some((t) => t.isPinned),
      isStarred: sorted.some((t) => t.isStarred),
      hasAttachments: sorted.some((t) => t.hasAttachments),
    });
  }
  return groups.sort(
    (a, b) =>
      Number(b.isPinned) - Number(a.isPinned) ||
      b.lead.lastMessage.receivedAt - a.lead.lastMessage.receivedAt,
  );
}

/** The conversation to open first: the most recent one with unread mail, else the latest. */
export function firstToOpen(group: ContactGroup): ThreadSummary {
  return group.threads.find((t) => t.unreadCount > 0) ?? group.lead;
}
