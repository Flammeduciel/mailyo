/**
 * IMAP/SMTP mail provider (Yahoo, iCloud, Orange, Free, OVH…), on top of the
 * native `mailyo-imap` module. Settings and password are loaded from secure
 * storage on first use; folders are recognised by their SPECIAL-USE flags.
 */

import type { MailyoImapNative, ServerConfig } from '../../../modules/mailyo-imap';

import type { FolderRole } from '@/domain/models';
import { buildRawMessage } from '@/providers/gmail/gmail-codec';
import type { ImapAccountConfig } from '@/providers/imap/credentials';
import { folderRole, folderRoles, nativeToRemote } from '@/providers/imap/imap-codec';
import type {
  FetchMessagesInput,
  FetchMessagesResult,
  FetchOlderMessagesInput,
  MailProvider,
  OutgoingMessage,
  RemoteAttachment,
  RemoteFolder,
  RemoteMessage,
  SendResult,
} from '@/providers/types';

const FOLDER_NAMES: Partial<Record<FolderRole, string>> = {
  inbox: 'Boîte de réception',
  sent: 'Envoyés',
  spam: 'Spam',
};

/** Roles synchronised into the app (like Gmail: inbox, sent, spam). */
const SYNCED_ROLES: FolderRole[] = ['inbox', 'sent', 'spam'];

export interface ImapMailProviderOptions {
  emailAddress: string;
  loadConfig: () => Promise<ImapAccountConfig | null>;
  /** Native client; injected in tests. */
  native: () => MailyoImapNative;
  /** IMAP UIDs are per folder: the folder holding a stored message. */
  lookupFolder: (remoteUid: number) => Promise<string | null>;
}

export class ImapMailProvider implements MailProvider {
  readonly id = 'imap';
  readonly emailAddress: string;
  private readonly options: ImapMailProviderOptions;
  private config: ImapAccountConfig | null = null;
  private roles: Partial<Record<FolderRole, string>> | null = null;

  constructor(options: ImapMailProviderOptions) {
    this.emailAddress = options.emailAddress;
    this.options = options;
  }

  private get client(): MailyoImapNative {
    return this.options.native();
  }

  private async servers(): Promise<{ imap: ServerConfig; smtp: ServerConfig }> {
    this.config ??= await this.options.loadConfig();
    const config = this.config;
    if (!config) {
      throw new Error('Identifiants IMAP introuvables : reconnectez le compte.');
    }
    const auth = { username: config.username, password: config.password };
    return { imap: { ...config.imap, ...auth }, smtp: { ...config.smtp, ...auth } };
  }

  /** Folder of each role on this server (cached for the session). */
  private async folderRoles(): Promise<Partial<Record<FolderRole, string>>> {
    if (!this.roles) {
      const { imap } = await this.servers();
      this.roles = folderRoles(await this.client.listFolders(imap));
      this.roles.inbox ??= 'INBOX';
    }
    return this.roles;
  }

  async listFolders(): Promise<RemoteFolder[]> {
    const roles = await this.folderRoles();
    return SYNCED_ROLES.filter((role) => roles[role]).map((role) => ({
      remoteFolderId: roles[role]!,
      name: FOLDER_NAMES[role] ?? role,
      role,
    }));
  }

  async fetchMessages(input: FetchMessagesInput): Promise<FetchMessagesResult> {
    const { imap } = await this.servers();
    const limit = input.limit ?? 50;
    // A changed UIDVALIDITY means the server renumbered the folder: start over.
    const result = await this.client.fetchMessages(
      imap,
      input.folderRemoteId,
      input.lastSyncedUid ?? -1,
      limit,
    );
    const restart =
      input.knownUidValidity !== null && input.knownUidValidity !== result.uidValidity;
    const messages = restart
      ? (await this.client.fetchMessages(imap, input.folderRemoteId, -1, limit)).messages
      : result.messages;
    input.onProgress?.(messages.length, messages.length);
    return {
      uidValidity: result.uidValidity,
      messages: messages
        .map((message) => nativeToRemote(message, input.folderRemoteId))
        .sort((a, b) => a.remoteUid - b.remoteUid),
    };
  }

  async fetchOlderMessages(input: FetchOlderMessagesInput): Promise<RemoteMessage[]> {
    const { imap } = await this.servers();
    const older = await this.client.fetchOlder(
      imap,
      input.folderRemoteId,
      input.beforeUid,
      input.limit ?? 30,
    );
    return older.map((message) => nativeToRemote(message, input.folderRemoteId));
  }

  async send(message: OutgoingMessage): Promise<SendResult> {
    let servers: { imap: ServerConfig; smtp: ServerConfig };
    try {
      servers = await this.servers();
    } catch (error) {
      return { status: 'failed', error: error instanceof Error ? error.message : String(error) };
    }
    const raw = buildRawMessage(this.emailAddress, message).replace(/-/g, '+').replace(/_/g, '/');
    const padded = raw + '='.repeat((4 - (raw.length % 4)) % 4);
    const recipients = [...message.to, ...message.cc, ...message.bcc].map((r) => r.address);
    const roles = await this.folderRoles().catch(() => ({}) as Partial<Record<FolderRole, string>>);
    try {
      await this.client.sendRaw(servers.smtp, padded, recipients, servers.imap, roles.sent ?? null);
      return { status: 'sent', remoteId: message.messageId ?? null };
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error);
      // Refused before sending (login, address) is a failure; a dropped
      // connection after DATA may have delivered it.
      const ambiguous = !/AUTH|refusé|Invalid Addresses|550|553/i.test(text);
      return { status: ambiguous ? 'ambiguous' : 'failed', error: text };
    }
  }

  private async withMessage<T>(
    remoteUid: number,
    action: (imap: ServerConfig, folder: string) => Promise<T>,
  ): Promise<T> {
    const { imap } = await this.servers();
    const folder = (await this.options.lookupFolder(remoteUid)) ?? 'INBOX';
    return action(imap, folder);
  }

  async setRead(remoteUid: number, isRead: boolean): Promise<void> {
    await this.withMessage(remoteUid, (imap, folder) =>
      this.client.setFlag(imap, folder, remoteUid, 'seen', isRead),
    );
  }

  async star(remoteUid: number, isStarred: boolean): Promise<void> {
    await this.withMessage(remoteUid, (imap, folder) =>
      this.client.setFlag(imap, folder, remoteUid, 'flagged', isStarred),
    );
  }

  private async moveTo(remoteUid: number, role: FolderRole): Promise<void> {
    const target = (await this.folderRoles())[role];
    if (!target) {
      throw new Error(`Ce serveur n’a pas de dossier « ${role} ».`);
    }
    await this.withMessage(remoteUid, (imap, folder) =>
      folder === target
        ? Promise.resolve(true)
        : this.client.moveMessage(imap, folder, remoteUid, target),
    );
  }

  async archive(remoteUid: number): Promise<void> {
    await this.moveTo(remoteUid, 'archive');
  }

  async moveToTrash(remoteUid: number): Promise<void> {
    await this.moveTo(remoteUid, 'trash');
  }

  async setSpam(remoteUid: number, isSpam: boolean): Promise<void> {
    await this.moveTo(remoteUid, isSpam ? 'spam' : 'inbox');
  }

  async downloadAttachment(remoteUid: number, remotePartId: string): Promise<string> {
    return this.withMessage(remoteUid, (imap, folder) =>
      this.client.downloadAttachment(imap, folder, remoteUid, remotePartId),
    );
  }

  async fetchAttachments(): Promise<RemoteAttachment[]> {
    // Attachments are listed with every fetched message: nothing to backfill.
    return [];
  }

  async fetchUnsubscribeHeaders(
    remoteUid: number,
  ): Promise<{ listUnsubscribe: string | null; listUnsubscribePost: string | null }> {
    const headers = await this.withMessage(remoteUid, (imap, folder) =>
      this.client.fetchHeaders(imap, folder, remoteUid, [
        'List-Unsubscribe',
        'List-Unsubscribe-Post',
      ]),
    );
    return {
      listUnsubscribe: headers['List-Unsubscribe'] ?? null,
      listUnsubscribePost: headers['List-Unsubscribe-Post'] ?? null,
    };
  }

  watch(): () => void {
    // Real-time (IMAP IDLE) needs a foreground service: periodic sync for now.
    return () => {};
  }
}

export { folderRole };
