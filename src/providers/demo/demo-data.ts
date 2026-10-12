/**
 * Deterministic demo content for the app's "mode démo" and for integration
 * tests. Everything here is fixed (no network, no randomness) so the same
 * conversations, folders and rules are produced on every run.
 *
 * The threading headers are coherent on purpose: every `In-Reply-To` /
 * `References` value points to a `Message-ID` of the same conversation, which
 * lets the threading engine (plan §6) group the messages without relying on the
 * subject fallback.
 */

import type { Account, Folder, NotificationRule } from '@/domain/models';
import { deterministicId } from '@/domain/ids';
import { MockMailProvider } from '@/providers/mock/mock-mail-provider';
import type { RemoteFolder, RemoteMessage } from '@/providers/types';

const DEMO_ACCOUNT_ID = 'acc_demo';
const DEMO_EMAIL = 'demo@mailyo.app';

/** Fixed clock so the demo data never depends on the current time. */
const BASE_TIME = Date.UTC(2026, 0, 12, 8, 30);
const HOUR = 60 * 60 * 1000;

const INBOX_FOLDER: RemoteFolder = {
  remoteFolderId: 'INBOX',
  name: 'Boîte de réception',
  role: 'inbox',
};

const SENT_FOLDER: RemoteFolder = {
  remoteFolderId: 'SENT',
  name: 'Messages envoyés',
  role: 'sent',
};

export function createDemoAccount(now: number = Date.now()): Account {
  return {
    id: DEMO_ACCOUNT_ID,
    provider: 'gmail',
    emailAddress: DEMO_EMAIL,
    displayName: 'Compte démo',
    authType: 'oauth',
    syncEnabled: true,
    lastSyncAt: null,
    syncStatus: 'idle',
    createdAt: now,
  };
}

export function createDemoFolders(accountId: string): Folder[] {
  return [
    {
      id: deterministicId(accountId, INBOX_FOLDER.remoteFolderId),
      accountId,
      remoteFolderId: INBOX_FOLDER.remoteFolderId,
      name: INBOX_FOLDER.name,
      role: 'inbox',
      lastUidValidity: null,
      lastSyncedUid: null,
    },
    {
      id: deterministicId(accountId, SENT_FOLDER.remoteFolderId),
      accountId,
      remoteFolderId: SENT_FOLDER.remoteFolderId,
      name: SENT_FOLDER.name,
      role: 'sent',
      lastUidValidity: null,
      lastSyncedUid: null,
    },
  ];
}

export function createDemoRemoteMessages(): RemoteMessage[] {
  return [
    {
      remoteUid: 1,
      folderRemoteId: INBOX_FOLDER.remoteFolderId,
      messageIdHeader: '<rdv-2026-01@atelier-nord.fr>',
      inReplyTo: null,
      referencesHeader: null,
      senderName: 'Claire Fontaine',
      senderAddress: 'claire.fontaine@atelier-nord.fr',
      to: [{ name: 'Compte démo', address: DEMO_EMAIL }],
      cc: [],
      subject: 'Préparation de la réunion d’équipe',
      bodyText:
        'Bonjour,\n\nVoici l’ordre du jour de notre réunion de vendredi. Peux-tu confirmer ta présence ?\n\nClaire',
      bodyHtml: null,
      receivedAt: BASE_TIME,
      isRead: false,
      isStarred: true,
      hasAttachments: true,
    },
    {
      remoteUid: 2,
      folderRemoteId: INBOX_FOLDER.remoteFolderId,
      messageIdHeader: '<rdv-2026-01-reponse@mailyo.app>',
      inReplyTo: '<rdv-2026-01@atelier-nord.fr>',
      referencesHeader: '<rdv-2026-01@atelier-nord.fr>',
      senderName: 'Compte démo',
      senderAddress: DEMO_EMAIL,
      to: [{ name: 'Claire Fontaine', address: 'claire.fontaine@atelier-nord.fr' }],
      cc: [{ name: 'Bureau', address: 'bureau@atelier-nord.fr' }],
      subject: 'Re: Préparation de la réunion d’équipe',
      bodyText: 'Bonjour Claire,\n\nJe serai présent vendredi à 10 h. À bientôt.',
      bodyHtml: null,
      receivedAt: BASE_TIME + 25 * 60 * 1000,
      isRead: true,
      isStarred: false,
      hasAttachments: false,
    },
    {
      remoteUid: 3,
      folderRemoteId: INBOX_FOLDER.remoteFolderId,
      messageIdHeader: '<rdv-2026-01-suite@atelier-nord.fr>',
      inReplyTo: '<rdv-2026-01-reponse@mailyo.app>',
      referencesHeader: '<rdv-2026-01@atelier-nord.fr> <rdv-2026-01-reponse@mailyo.app>',
      senderName: 'Claire Fontaine',
      senderAddress: 'claire.fontaine@atelier-nord.fr',
      to: [{ name: 'Compte démo', address: DEMO_EMAIL }],
      cc: [],
      subject: 'Re: Préparation de la réunion d’équipe',
      bodyText: 'Parfait, je réserve la salle. Merci !',
      bodyHtml: null,
      receivedAt: BASE_TIME + 24 * HOUR,
      isRead: false,
      isStarred: false,
      hasAttachments: false,
    },
    {
      remoteUid: 4,
      folderRemoteId: INBOX_FOLDER.remoteFolderId,
      messageIdHeader: '<facture-2026-01@orange.fr>',
      inReplyTo: null,
      referencesHeader: null,
      senderName: 'Service Clients Orange',
      senderAddress: 'facturation@orange.fr',
      to: [{ name: 'Compte démo', address: DEMO_EMAIL }],
      cc: [],
      subject: 'Votre facture de janvier',
      bodyText:
        'Bonjour,\n\nVotre facture de janvier est disponible dans votre espace client. Montant : 29,99 €.',
      bodyHtml: null,
      receivedAt: BASE_TIME + 2 * HOUR,
      isRead: true,
      isStarred: false,
      hasAttachments: false,
    },
    {
      remoteUid: 5,
      folderRemoteId: INBOX_FOLDER.remoteFolderId,
      messageIdHeader: '<facture-2026-01-reponse@mailyo.app>',
      inReplyTo: '<facture-2026-01@orange.fr>',
      referencesHeader: '<facture-2026-01@orange.fr>',
      senderName: 'Compte démo',
      senderAddress: DEMO_EMAIL,
      to: [{ name: 'Service Clients Orange', address: 'facturation@orange.fr' }],
      cc: [],
      subject: 'Re: Votre facture de janvier',
      bodyText: 'Bonjour,\n\nPouvez-vous m’indiquer le détail des options facturées ? Merci.',
      bodyHtml: null,
      receivedAt: BASE_TIME + 2 * HOUR + 45 * 60 * 1000,
      isRead: true,
      isStarred: false,
      hasAttachments: false,
    },
  ];
}

export function createDemoRules(accountId: string): NotificationRule[] {
  return [
    {
      id: deterministicId(accountId, 'rule-sender-claire'),
      accountId,
      matchType: 'sender',
      matchValue: 'claire.fontaine@atelier-nord.fr',
      action: 'notify',
      soundId: 'demo-chime',
      vibrationMode: 'default',
      enabled: true,
      createdAt: BASE_TIME,
    },
    {
      id: deterministicId(accountId, 'rule-domain-orange'),
      accountId,
      matchType: 'domain',
      matchValue: 'orange.fr',
      action: 'silent',
      soundId: null,
      vibrationMode: 'none',
      enabled: true,
      createdAt: BASE_TIME,
    },
  ];
}

export function createDemoProvider(now: number = Date.now()): {
  account: Account;
  folders: Folder[];
  messages: RemoteMessage[];
  provider: MockMailProvider;
} {
  const account = createDemoAccount(now);
  const folders = createDemoFolders(account.id);
  const messages = createDemoRemoteMessages();
  const provider = new MockMailProvider({
    emailAddress: account.emailAddress,
    provider: account.provider,
    folders: [
      { ...INBOX_FOLDER },
      { ...SENT_FOLDER },
    ],
    messages,
  });

  return { account, folders, messages, provider };
}
