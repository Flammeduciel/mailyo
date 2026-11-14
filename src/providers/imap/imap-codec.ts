/**
 * Pure mapping between the native IMAP client and Wouah Mail's provider contract:
 * folder roles (SPECIAL-USE attributes, then usual names) and messages.
 */

import type { NativeFolder, NativeMessage } from '../../../modules/mailyo-imap';

import type { FolderRole } from '@/domain/models';
import { repairMojibake } from '@/domain/mojibake';
import type { RemoteMessage } from '@/providers/types';

const ATTRIBUTE_ROLES: Record<string, FolderRole> = {
  '\\sent': 'sent',
  '\\junk': 'spam',
  '\\archive': 'archive',
  '\\all': 'archive',
  '\\trash': 'trash',
  '\\drafts': 'drafts',
};

const NAME_ROLES: [RegExp, FolderRole][] = [
  [
    /^(sent|sent items|sent mail|sent messages|envoy[ée]s|messages envoy[ée]s|[ée]l[ée]ments envoy[ée]s|outbox)$/i,
    'sent',
  ],
  [
    /^(spam|junk|junk e-?mail|bulk mail|courrier ind[ée]sirable|ind[ée]sirables|pourriel)$/i,
    'spam',
  ],
  [/^(archive|archives|all mail|tous les messages)$/i, 'archive'],
  [
    /^(trash|deleted|deleted items|deleted messages|corbeille|bin|[ée]l[ée]ments supprim[ée]s)$/i,
    'trash',
  ],
  [/^(drafts|brouillons?)$/i, 'drafts'],
];

/** Role of a folder: INBOX, then SPECIAL-USE attributes, then common names (any language). */
export function folderRole(folder: NativeFolder): FolderRole {
  if (folder.fullName.toUpperCase() === 'INBOX') return 'inbox';
  for (const attribute of folder.attributes) {
    const role = ATTRIBUTE_ROLES[attribute.toLowerCase()];
    if (role) return role;
  }
  const leaf = folder.name.replace(/^\[.*?\][/.]?/, '');
  for (const [pattern, role] of NAME_ROLES) {
    if (pattern.test(leaf)) return role;
  }
  return 'custom';
}

/** The folder playing each role (first match wins: SPECIAL-USE is checked before names). */
export function folderRoles(folders: NativeFolder[]): Partial<Record<FolderRole, string>> {
  const byRole: Partial<Record<FolderRole, string>> = {};
  const sorted = [...folders].sort(
    (a, b) => Number(b.attributes.length > 0) - Number(a.attributes.length > 0),
  );
  for (const folder of sorted) {
    const role = folderRole(folder);
    if (role !== 'custom' && !byRole[role]) byRole[role] = folder.fullName;
  }
  return byRole;
}

export function nativeToRemote(message: NativeMessage, folderRemoteId: string): RemoteMessage {
  return {
    remoteUid: message.uid,
    folderRemoteId,
    messageIdHeader: message.messageId,
    inReplyTo: message.inReplyTo,
    referencesHeader: message.references,
    senderName: repairMojibake(message.fromName),
    senderAddress: message.fromAddress,
    to: message.to.map((a) => ({ name: repairMojibake(a.name), address: a.address })),
    cc: message.cc.map((a) => ({ name: repairMojibake(a.name), address: a.address })),
    subject: repairMojibake(message.subject),
    bodyText: message.text ?? '',
    bodyHtml: message.html,
    receivedAt: message.date,
    isRead: message.seen,
    isStarred: message.flagged,
    hasAttachments: message.attachments.length > 0,
    attachments: message.attachments.map((attachment) => ({
      filename: repairMojibake(attachment.filename),
      mimeType: attachment.mimeType,
      sizeBytes: Math.round(attachment.size),
      remotePartId: attachment.partPath,
    })),
    listUnsubscribe: message.listUnsubscribe ?? '',
    listUnsubscribePost: message.listUnsubscribePost,
    // IMAP has no Gmail-like categories: bulk mail (it carries List-Unsubscribe)
    // goes to « Actus », the rest is personal mail.
    category: message.listUnsubscribe ? 'updates' : null,
  };
}
