/**
 * Core domain models for MailChat.
 *
 * These types are the shared contract between the data layer, the provider
 * adapters, the sync engine and the presentation. They mirror the local data
 * model described in the unified plan (§15) but use camelCase in TypeScript.
 */

export type ProviderId = string; // 'gmail' | 'imap' | future providers
export type AuthType = 'oauth' | 'password';

export type SyncStatus = 'idle' | 'syncing' | 'error' | 'offline';
export type SyncState = 'synced' | 'pending' | 'failed';

export interface Account {
  id: string;
  provider: ProviderId;
  emailAddress: string;
  displayName: string;
  authType: AuthType;
  syncEnabled: boolean;
  lastSyncAt: number | null;
  syncStatus: SyncStatus;
  createdAt: number;
}

export type FolderRole = 'inbox' | 'sent' | 'archive' | 'drafts' | 'trash' | 'spam' | 'custom';

export interface Folder {
  id: string;
  accountId: string;
  remoteFolderId: string;
  name: string;
  role: FolderRole;
  lastUidValidity: number | null;
  lastSyncedUid: number | null;
}

export interface EmailAddress {
  name: string;
  address: string;
}

export interface Message {
  id: string;
  accountId: string;
  folderId: string;
  remoteUid: number | null;
  messageIdHeader: string | null;
  inReplyTo: string | null;
  referencesHeader: string | null;
  threadId: string;
  senderName: string;
  senderAddress: string;
  to: EmailAddress[];
  cc: EmailAddress[];
  subject: string;
  bodyText: string;
  bodyHtmlSanitized: string | null;
  receivedAt: number;
  isRead: boolean;
  isStarred: boolean;
  hasAttachments: boolean;
  syncState: SyncState;
}

export interface Thread {
  id: string;
  accountId: string;
  normalizedSubject: string;
  lastMessageAt: number;
  unreadCount: number;
  isPinned: boolean;
  isArchived: boolean;
}

/** A thread plus the fields the conversation list needs to render a row. */
export interface ThreadSummary extends Thread {
  lastMessage: Pick<
    Message,
    'senderName' | 'senderAddress' | 'subject' | 'bodyText' | 'receivedAt'
  >;
  messageCount: number;
  hasAttachments: boolean;
}

export type RuleMatchType = 'sender' | 'domain' | 'subject' | 'vip' | 'all';
export type RuleAction = 'notify' | 'silent';
export type VibrationMode = 'default' | 'short' | 'long' | 'none';

export interface NotificationRule {
  id: string;
  /** null = applies to every account (global rule). */
  accountId: string | null;
  matchType: RuleMatchType;
  /** '' for `all`. */
  matchValue: string;
  action: RuleAction;
  soundId: string | null;
  vibrationMode: VibrationMode;
  enabled: boolean;
  createdAt: number;
}

export interface NotificationEvent {
  id: string;
  messageId: string;
  ruleId: string | null;
  notifiedAt: number;
  result: 'notified' | 'silenced' | 'deduped';
  reason: string;
}

export interface Draft {
  id: string;
  accountId: string;
  remoteDraftId: string | null;
  to: EmailAddress[];
  cc: EmailAddress[];
  bcc: EmailAddress[];
  subject: string;
  body: string;
  updatedAt: number;
  syncState: SyncState;
}

export interface Attachment {
  id: string;
  messageId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  remotePartId: string | null;
  localPath: string | null;
  downloadState: 'remote' | 'downloading' | 'downloaded' | 'failed';
}

export type PendingOperationType =
  'send' | 'markRead' | 'markUnread' | 'archive' | 'delete' | 'star';
export type PendingOperationStatus = 'pending' | 'running' | 'done' | 'failed' | 'conflict';

export interface PendingOperation {
  id: string;
  accountId: string;
  messageId: string | null;
  operationType: PendingOperationType;
  payload: Record<string, unknown>;
  createdAt: number;
  retryCount: number;
  status: PendingOperationStatus;
  lastError: string | null;
}
