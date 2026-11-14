/**
 * Provider adapter contracts.
 *
 * The application talks to mail servers only through these interfaces. The MVP
 * ships a deterministic in-memory implementation (`MockMailProvider`) so the
 * whole receive/send/notify pipeline can be developed and tested without a
 * device or Google credentials. Real Gmail OAuth / IMAP IDLE / SMTP adapters
 * (Phase 0) implement the same contracts.
 */

import type { EmailAddress, FolderRole, MailCategory, ProviderId } from '@/domain/models';

export interface RemoteFolder {
  remoteFolderId: string;
  name: string;
  role: FolderRole;
}

/** A message as returned by a provider, before local ids/threading are assigned. */
/** Attachment metadata as announced by the provider. */
export interface RemoteAttachment {
  filename: string;
  mimeType: string;
  sizeBytes: number;
  /** Provider handle used by `downloadAttachment` (Gmail attachmentId, MIME part…). */
  remotePartId: string | null;
  /**
   * Directly usable URI (https:, file:, data:) when the content is already
   * reachable without a download, used by the demo provider.
   */
  contentUri?: string | null;
}

export interface RemoteMessage {
  remoteUid: number;
  folderRemoteId: string;
  messageIdHeader: string | null;
  inReplyTo: string | null;
  referencesHeader: string | null;
  senderName: string;
  senderAddress: string;
  to: EmailAddress[];
  cc: EmailAddress[];
  subject: string;
  bodyText: string;
  bodyHtml: string | null;
  receivedAt: number;
  isRead: boolean;
  isStarred: boolean;
  hasAttachments: boolean;
  attachments?: RemoteAttachment[];
  listUnsubscribe?: string | null;
  listUnsubscribePost?: string | null;
  /** Provider category (Gmail tabs), when the provider has one. */
  category?: MailCategory | null;
}

export interface FetchOlderMessagesInput {
  folderRemoteId: string;
  /** Oldest UID stored locally: only strictly older messages are returned. */
  beforeUid: number;
  limit?: number;
}

export interface FetchMessagesInput {
  folderRemoteId: string;
  /** UIDVALIDITY observed on the last sync, or null when unknown. */
  knownUidValidity: number | null;
  /** Last UID already stored locally, or null for the initial sync. */
  lastSyncedUid: number | null;
  limit?: number;
  /** Download progress, for providers that fetch messages one by one. */
  onProgress?: (fetched: number, total: number) => void;
}

export interface FetchMessagesResult {
  uidValidity: number;
  messages: RemoteMessage[];
}

/** A file attached to an outgoing message, already read as base64. */
export interface OutgoingAttachment {
  filename: string;
  mimeType: string;
  base64: string;
}

export interface OutgoingMessage {
  to: EmailAddress[];
  cc: EmailAddress[];
  bcc: EmailAddress[];
  subject: string;
  bodyText: string;
  bodyHtml?: string | null;
  inReplyTo?: string | null;
  references?: string | null;
  attachments?: OutgoingAttachment[];
  /** Message-ID chosen by the app, also used for the local copy (no duplicate when the Sent folder syncs). */
  messageId?: string | null;
  /** Send time (ms), for the Date header. */
  date?: number | null;
}

/**
 * `ambiguous` means the result of the send is unknown (network dropped after
 * transmission). The UI must present "statut à vérifier" instead of retrying
 * blindly (plan §7).
 */
export type SendStatus = 'sent' | 'ambiguous' | 'failed';

export interface SendResult {
  status: SendStatus;
  remoteId?: string | null;
  error?: string | null;
}

export interface MailProvider {
  readonly id: ProviderId;
  readonly emailAddress: string;
  listFolders(): Promise<RemoteFolder[]>;
  fetchMessages(input: FetchMessagesInput): Promise<FetchMessagesResult>;
  /**
   * Page backwards through history (infinite scroll), newest first. Optional:
   * providers without it simply have no "load more".
   */
  fetchOlderMessages?(input: FetchOlderMessagesInput): Promise<RemoteMessage[]>;
  send(message: OutgoingMessage): Promise<SendResult>;
  setRead(remoteUid: number, isRead: boolean): Promise<void>;
  star(remoteUid: number, isStarred: boolean): Promise<void>;
  archive(remoteUid: number): Promise<void>;
  moveToTrash(remoteUid: number): Promise<void>;
  /** Raw bytes (base64) of an attachment, for providers that need a download. */
  downloadAttachment?(remoteUid: number, remotePartId: string): Promise<string>;
  /** Create (no id) or replace a server-side draft; returns its id. */
  saveDraft?(draftId: string | null, message: OutgoingMessage): Promise<string>;
  deleteDraft?(draftId: string): Promise<void>;
  /** Move a message to (true) or out of (false) the spam folder. */
  setSpam?(remoteUid: number, isSpam: boolean): Promise<void>;
  /** List-Unsubscribe headers of an already synced message (backfill). */
  fetchUnsubscribeHeaders?(
    remoteUid: number,
  ): Promise<{ listUnsubscribe: string | null; listUnsubscribePost: string | null }>;
  /** Newest mails of the provider's trash, newest first (read live, never stored). */
  listTrash?(limit: number): Promise<RemoteMessage[]>;
  /**
   * Move a trashed mail back where it was. Returns the message to store
   * locally when the regular sync would not bring it back (older than the sync
   * cursor), or null when the next sync will pick it up.
   */
  restoreFromTrash?(message: RemoteMessage): Promise<RemoteMessage | null>;
  /** Attachment list of an already synced message (backfill for older mails). */
  fetchAttachments?(remoteUid: number): Promise<RemoteAttachment[]>;
  /**
   * Subscribe to "new message" hints (IMAP IDLE in production). Returns an
   * unsubscribe function. The mock implementation can be driven manually.
   */
  watch(onHint: () => void): () => void;
}

export interface OAuthTokens {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: number | null;
  scope?: string;
  tokenType?: string;
}

export interface OAuthAdapter {
  authorize(): Promise<OAuthTokens>;
  refresh(tokens: OAuthTokens): Promise<OAuthTokens>;
  revoke(tokens: OAuthTokens): Promise<void>;
}

/** Secure storage for OAuth tokens (never SQLite, never AsyncStorage). */
export interface TokenStore {
  save(accountId: string, tokens: OAuthTokens): Promise<void>;
  load(accountId: string): Promise<OAuthTokens | null>;
  remove(accountId: string): Promise<void>;
}

/** Resolves a mail provider for an account. */
export interface ProviderFactory {
  (input: { accountId: string; provider: ProviderId; emailAddress: string }): MailProvider;
}
