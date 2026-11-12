import { requireNativeModule } from 'expo-modules-core';

/** Server settings for one connection (IMAP or SMTP). */
export interface ServerConfig {
  host: string;
  port: number;
  /** 'ssl' = implicit TLS (993 / 465), 'starttls' (143 / 587), 'none' (tests only). */
  security: 'ssl' | 'starttls' | 'none';
  username: string;
  password: string;
}

export interface NativeFolder {
  fullName: string;
  name: string;
  attributes: string[];
}

export interface NativeAddress {
  name: string;
  address: string;
}

export interface NativeAttachment {
  filename: string;
  mimeType: string;
  size: number;
  partPath: string;
}

export interface NativeMessage {
  uid: number;
  messageId: string | null;
  inReplyTo: string | null;
  references: string | null;
  fromName: string;
  fromAddress: string;
  to: NativeAddress[];
  cc: NativeAddress[];
  subject: string;
  date: number;
  seen: boolean;
  flagged: boolean;
  text: string | null;
  html: string | null;
  attachments: NativeAttachment[];
  listUnsubscribe: string | null;
  listUnsubscribePost: string | null;
}

/** The native IMAP/SMTP client (Android, JavaMail). */
export interface MailyoImapNative {
  testConnection(imap: ServerConfig, smtp: ServerConfig): Promise<boolean>;
  listFolders(imap: ServerConfig): Promise<NativeFolder[]>;
  fetchMessages(
    imap: ServerConfig,
    folder: string,
    lastUid: number,
    limit: number,
  ): Promise<{ uidValidity: number; messages: NativeMessage[] }>;
  fetchOlder(
    imap: ServerConfig,
    folder: string,
    beforeUid: number,
    limit: number,
  ): Promise<NativeMessage[]>;
  setFlag(
    imap: ServerConfig,
    folder: string,
    uid: number,
    flag: 'seen' | 'flagged',
    value: boolean,
  ): Promise<boolean>;
  moveMessage(
    imap: ServerConfig,
    fromFolder: string,
    uid: number,
    toFolder: string,
  ): Promise<boolean>;
  downloadAttachment(
    imap: ServerConfig,
    folder: string,
    uid: number,
    partPath: string,
  ): Promise<string>;
  fetchHeaders(
    imap: ServerConfig,
    folder: string,
    uid: number,
    names: string[],
  ): Promise<Record<string, string | null>>;
  sendRaw(
    smtp: ServerConfig,
    rawBase64: string,
    recipients: string[],
    imap: ServerConfig | null,
    sentFolder: string | null,
  ): Promise<boolean>;
  disconnect(imap: ServerConfig): Promise<boolean>;

  // « Notifications instantanées » (IMAP IDLE foreground service)
  /** JSON of the push configuration (accounts + notification prefs); empty list stops it. */
  startPush(configJson: string): boolean;
  stopPush(): boolean;
  setAppForeground(foreground: boolean): boolean;
  pushStatus(): { running: boolean; accounts: string[]; batteryUnrestricted: boolean };
  openBatterySettings(): boolean;
  addListener(
    event: 'onNewMail',
    listener: (event: { accountId: string; count: number }) => void,
  ): { remove: () => void };
}

/** One mailbox watched by the real-time service. */
export interface PushAccountConfig {
  id: string;
  email: string;
  host: string;
  port: number;
  security: 'ssl' | 'starttls' | 'none';
  username: string;
  password?: string | null;
  oauthAccessToken?: string | null;
  oauthRefreshToken?: string | null;
  oauthClientId?: string | null;
  oauthExpiresAt?: number;
}

export interface PushConfig {
  accounts: PushAccountConfig[];
  contentMode: 'full' | 'sender' | 'hidden';
  /** Quiet hours, -1 when off. */
  quietStart: number;
  quietEnd: number;
}

let cached: MailyoImapNative | null = null;

/** Loaded on first use, so screens and tests that never touch IMAP do not need the native module. */
export function getMailyoImap(): MailyoImapNative {
  cached ??= requireNativeModule<MailyoImapNative>('MailyoImap');
  return cached;
}
