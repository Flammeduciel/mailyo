/**
 * Deterministic in-memory mail server used by the app (mode démo) and by every
 * test that needs the receive/send/notify pipeline without a device, network or
 * Google credentials (plan §11, D-011).
 *
 * It implements the same `MailProvider` contract as the future Gmail/IMAP/SMTP
 * adapters (Phase 0) so the sync engine cannot tell them apart.
 */

import type {
  FetchMessagesInput,
  FetchMessagesResult,
  MailProvider,
  OutgoingMessage,
  RemoteFolder,
  RemoteAttachment,
  RemoteMessage,
  SendResult,
  SendStatus,
} from '@/providers/types';
import type { ProviderId } from '@/domain/models';

/** Default page size, mirroring `DEFAULT_PAGE_SIZE` (plan §7). */
const DEFAULT_FETCH_LIMIT = 50;

const DEFAULT_INBOX: RemoteFolder = {
  remoteFolderId: 'INBOX',
  name: 'Boîte de réception',
  role: 'inbox',
};

/** Remote folder a message is moved to by `archive()`. */
const ARCHIVE_FOLDER_ID = 'ARCHIVE';
/** Remote folder a message is moved to by `moveToTrash()`. */
const TRASH_FOLDER_ID = 'TRASH';

export interface MockProviderOptions {
  emailAddress: string;
  provider?: ProviderId;
  folders?: RemoteFolder[];
  messages?: RemoteMessage[];
  uidValidity?: number;
}

/**
 * Deterministic in-memory `MailProvider`.
 *
 * Fetching is cursor-based exactly like IMAP: messages are returned in
 * ascending UID order and only those above `lastSyncedUid`. Passing a
 * `knownUidValidity` that differs from the current one simulates a UIDVALIDITY
 * change and forces a full re-fetch (the local cursor is invalidated).
 */
export class MockMailProvider implements MailProvider {
  readonly id: ProviderId;
  readonly emailAddress: string;

  private folders: RemoteFolder[];
  private messages: RemoteMessage[];
  private uidValidity: number;
  private readonly listeners = new Set<() => void>();
  private nextSendStatus: SendStatus | null = null;
  private sendCount = 0;

  /** Records every message passed to `send()`, in order. */
  readonly sentMessages: OutgoingMessage[] = [];

  constructor(options: MockProviderOptions) {
    this.id = options.provider ?? 'mock';
    this.emailAddress = options.emailAddress;
    this.folders = options.folders
      ? options.folders.map((folder) => ({ ...folder }))
      : [DEFAULT_INBOX];
    this.messages = options.messages ? options.messages.map(cloneMessage) : [];
    this.uidValidity = options.uidValidity ?? 1;
  }

  async listFolders(): Promise<RemoteFolder[]> {
    return this.folders.map((folder) => ({ ...folder }));
  }

  async fetchMessages(input: FetchMessagesInput): Promise<FetchMessagesResult> {
    const uidValidityChanged =
      input.knownUidValidity !== null && input.knownUidValidity !== this.uidValidity;

    // On a UIDVALIDITY change the stored cursor is meaningless: re-fetch the
    // whole folder from scratch, like a real client must.
    const lastSyncedUid = uidValidityChanged ? -1 : (input.lastSyncedUid ?? -1);
    const limit = input.limit ?? DEFAULT_FETCH_LIMIT;

    const messages = this.messages
      .filter(
        (message) =>
          message.folderRemoteId === input.folderRemoteId && message.remoteUid > lastSyncedUid,
      )
      .sort((a, b) => a.remoteUid - b.remoteUid)
      .slice(0, limit)
      .map(cloneMessage);

    return { uidValidity: this.uidValidity, messages };
  }

  async send(message: OutgoingMessage): Promise<SendResult> {
    this.sentMessages.push(message);
    this.sendCount += 1;
    // `nextSendStatus` is a one-shot override: the *next* send uses it, then it
    // is cleared so later sends succeed again.
    const status = this.nextSendStatus ?? 'sent';
    this.nextSendStatus = null;

    const result: SendResult = { status, remoteId: `sent-${this.sendCount}` };
    if (status === 'failed') {
      result.error = 'Envoi simulé en échec (mock)';
    }
    return result;
  }

  async setRead(remoteUid: number, isRead: boolean): Promise<void> {
    const message = this.findMessage(remoteUid);
    if (message) {
      message.isRead = isRead;
    }
  }

  async star(remoteUid: number, isStarred: boolean): Promise<void> {
    const message = this.findMessage(remoteUid);
    if (message) {
      message.isStarred = isStarred;
    }
  }

  async archive(remoteUid: number): Promise<void> {
    const message = this.findMessage(remoteUid);
    if (message) {
      message.folderRemoteId = ARCHIVE_FOLDER_ID;
    }
  }

  async moveToTrash(remoteUid: number): Promise<void> {
    const message = this.findMessage(remoteUid);
    if (message) {
      message.folderRemoteId = TRASH_FOLDER_ID;
    }
  }

  watch(onHint: () => void): () => void {
    this.listeners.add(onHint);
    return () => {
      this.listeners.delete(onHint);
    };
  }

  // --- Test / demo hooks -----------------------------------------------------
  // These are not part of `MailProvider`; they let tests and the demo drive the
  // server like a real one would (new mail arriving, send failures...).

  /** Add a message to the server and notify watchers (simulates new mail). */
  deliverRemote(message: RemoteMessage): void {
    this.messages.push(cloneMessage(message));
    this.emitHint();
  }

  /** Force the status returned by the next `send()` call. */
  setNextSendStatus(status: SendStatus): void {
    this.nextSendStatus = status;
  }

  /** Change UIDVALIDITY (simulates a folder renumbering). */
  setUidValidity(uidValidity: number): void {
    this.uidValidity = uidValidity;
  }

  readonly drafts = new Map<string, OutgoingMessage>();

  async saveDraft(draftId: string | null, message: OutgoingMessage): Promise<string> {
    const id = draftId ?? `draft-${this.drafts.size + 1}`;
    this.drafts.set(id, message);
    return id;
  }

  async deleteDraft(draftId: string): Promise<void> {
    this.drafts.delete(draftId);
  }

  async fetchAttachments(remoteUid: number): Promise<RemoteAttachment[]> {
    return (this.findMessage(remoteUid)?.attachments ?? []).map((a) => ({ ...a }));
  }

  private findMessage(remoteUid: number): RemoteMessage | undefined {
    return this.messages.find((message) => message.remoteUid === remoteUid);
  }

  private emitHint(): void {
    for (const listener of [...this.listeners]) {
      listener();
    }
  }
}

function cloneMessage(message: RemoteMessage): RemoteMessage {
  return {
    ...message,
    to: [...message.to],
    cc: [...message.cc],
    attachments: message.attachments?.map((attachment) => ({ ...attachment })),
  };
}
