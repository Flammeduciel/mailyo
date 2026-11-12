/**
 * Mailboxes of the side drawer: Gmail's inbox categories plus the usual
 * folders. Each maps to list options; the drawer shows how many conversations
 * in it are unread.
 */

import type { ConversationFilter, FolderRole, MailCategory } from '@/domain/models';

export type MailboxId =
  | 'all'
  | 'primary'
  | 'promotions'
  | 'social'
  | 'updates'
  | 'forums'
  | 'starred'
  | 'sent'
  | 'spam'
  | 'archived';

export interface MailboxQuery {
  category?: MailCategory;
  folderRole?: FolderRole;
  starredOnly?: boolean;
  filter?: ConversationFilter;
  archivedOnly?: boolean;
  includeArchived?: boolean;
}

export interface MailboxDefinition {
  id: MailboxId;
  label: string;
  icon: string;
  /** Section of the drawer it sits in. */
  section: 'inbox' | 'folders';
  query: MailboxQuery;
}

export const MAILBOXES: MailboxDefinition[] = [
  { id: 'all', label: 'Toutes les boîtes', icon: 'all-inbox', section: 'inbox', query: {} },
  {
    id: 'primary',
    label: 'Principale',
    icon: 'inbox',
    section: 'inbox',
    query: { category: 'primary' },
  },
  {
    id: 'promotions',
    label: 'Promotions',
    icon: 'local-offer',
    section: 'inbox',
    query: { category: 'promotions' },
  },
  {
    id: 'social',
    label: 'Réseaux sociaux',
    icon: 'people-outline',
    section: 'inbox',
    query: { category: 'social' },
  },
  {
    id: 'updates',
    label: 'Notifications',
    icon: 'info-outline',
    section: 'inbox',
    query: { category: 'updates' },
  },
  {
    id: 'forums',
    label: 'Forums',
    icon: 'forum',
    section: 'inbox',
    query: { category: 'forums' },
  },
  {
    id: 'starred',
    label: 'Favoris',
    icon: 'star-outline',
    section: 'folders',
    query: { starredOnly: true, includeArchived: true },
  },
  {
    id: 'sent',
    label: 'Envoyés',
    icon: 'send',
    section: 'folders',
    query: { folderRole: 'sent', includeArchived: true },
  },
  {
    id: 'spam',
    label: 'Spam',
    icon: 'report-gmailerrorred',
    section: 'folders',
    query: { filter: 'spam', includeArchived: true },
  },
  {
    id: 'archived',
    label: 'Archivés',
    icon: 'inventory-2',
    section: 'folders',
    query: { archivedOnly: true },
  },
];

export function mailbox(id: string | undefined): MailboxDefinition {
  return MAILBOXES.find((box) => box.id === id) ?? MAILBOXES[0];
}

export interface MailboxCount {
  total: number;
  unread: number;
}

/** What the drawer badge shows: unread conversations, except where "unread" means little. */
export function badgeCount(id: MailboxId, count: MailboxCount | undefined): number {
  if (!count) return 0;
  // Sent and archived mail is read by definition; spam shows how many are waiting.
  if (id === 'sent' || id === 'archived') return 0;
  if (id === 'spam' || id === 'starred') return count.total;
  return count.unread;
}
