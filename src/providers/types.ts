/**
 * Provider adapter contracts.
 *
 * The application talks to mail servers only through these interfaces. The MVP
 * ships a deterministic in-memory implementation (`MockMailProvider`) so the
 * whole receive/send/notify pipeline can be developed and tested without a
 * device or Google credentials. Real Gmail OAuth / IMAP IDLE / SMTP adapters
 * (Phase 0) implement the same contracts.
 */

import type { EmailAddress, FolderRole, ProviderId } from '@/domain/models';

export interface RemoteFolder {
  remoteFolderId: string;
  name: string;
  role: FolderRole;
}

/** A message as returned by a provider, before local ids/threading are assigned. */
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
}

export interface FetchMessagesInput {
  folderRemoteId: string;
  /** UIDVALIDITY observed on the last sync, or null when unknown. */
  knownUidValidity: number | null;
  /** Last UID already stored locally, or null for the initial sync. */
  lastSyncedUid: number | null;
  limit?: number;
}

export interface FetchMessagesResult {
  uidValidity: number;
  messages: RemoteMessage[];
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
  send(message: OutgoingMessage): Promise<SendResult>;
  setRead(remoteUid: number, isRead: boolean): Promise<void>;
  star(remoteUid: number, isStarred: boolean): Promise<void>;
  archive(remoteUid: number): Promise<void>;
  moveToTrash(remoteUid: number): Promise<void>;
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
