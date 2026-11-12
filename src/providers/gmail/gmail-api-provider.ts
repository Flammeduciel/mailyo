/**
 * `MailProvider` backed by the Gmail REST API (HTTPS + OAuth access token).
 *
 * Chosen over IMAP/SMTP because it runs in plain JavaScript: no native module,
 * no rebuild (see decisions.md, D-039). Trade-off: no IMAP IDLE, so new mail is
 * picked up by the periodic sync instead of in real time.
 *
 * Identity mapping: the sync engine works with numeric UIDs, Gmail with
 * 64-bit hex ids. `remoteUid` is the message's `internalDate` (see
 * `gmailMessageToRemote`); ids seen during a fetch are cached, and after a
 * restart they are recovered through the stored Message-ID (`rfc822msgid:`).
 */

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
import {
  buildRawMessage,
  gmailMessageToRemote,
  type GmailMessage,
} from '@/providers/gmail/gmail-codec';
import type { AccessTokenProvider } from '@/providers/gmail/gmail-tokens';

const API_BASE = 'https://gmail.googleapis.com/gmail/v1/users/me';

/** Gmail has no UIDVALIDITY: the cursor (internalDate) never needs resetting. */
const UID_VALIDITY = 1;

/** Upper bound of ids listed per incremental run (safety net for huge gaps). */
const MAX_LISTED_IDS = 500;

/** Parallel `messages.get` requests. */
const FETCH_CONCURRENCY = 8;

const FOLDERS: RemoteFolder[] = [
  { remoteFolderId: 'INBOX', name: 'Boîte de réception', role: 'inbox' },
  { remoteFolderId: 'SENT', name: 'Envoyés', role: 'sent' },
  // Gmail's own spam filter: shown in the list with a "Spam" badge.
  { remoteFolderId: 'SPAM', name: 'Spam', role: 'spam' },
];

export class GmailApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'GmailApiError';
  }
}

export interface GmailApiProviderOptions {
  emailAddress: string;
  getAccessToken: AccessTokenProvider;
  /** Stored Message-ID of the local message with this UID, for id recovery. */
  lookupMessageIdHeader: (remoteUid: number) => Promise<string | null>;
  fetchImpl?: typeof fetch;
}

export class GmailApiProvider implements MailProvider {
  readonly id = 'gmail';
  readonly emailAddress: string;

  private readonly getAccessToken: AccessTokenProvider;
  private readonly lookupMessageIdHeader: (remoteUid: number) => Promise<string | null>;
  private readonly fetchImpl: typeof fetch;
  /** remoteUid → Gmail message id. */
  private readonly gmailIds = new Map<number, string>();

  constructor(options: GmailApiProviderOptions) {
    this.emailAddress = options.emailAddress;
    this.getAccessToken = options.getAccessToken;
    this.lookupMessageIdHeader = options.lookupMessageIdHeader;
    this.fetchImpl = options.fetchImpl ?? ((...args) => fetch(...args));
  }

  async listFolders(): Promise<RemoteFolder[]> {
    return FOLDERS.map((folder) => ({ ...folder }));
  }

  /**
   * Initial sync: the newest `limit` messages of the label. Incremental sync:
   * everything after the cursor, oldest first and capped to `limit`, so a large
   * backlog is caught up over several runs without gaps (same contract as IMAP).
   */
  async fetchMessages(input: FetchMessagesInput): Promise<FetchMessagesResult> {
    const limit = input.limit ?? 50;
    const cursor = input.lastSyncedUid;

    let ids: string[];
    if (cursor === null || cursor < 0) {
      ids = await this.listIds(input.folderRemoteId, null, limit);
    } else {
      // `after:` has one-second granularity; exact filtering happens below.
      const after = Math.max(0, Math.floor(cursor / 1000) - 1);
      ids = (await this.listIds(input.folderRemoteId, `after:${after}`, MAX_LISTED_IDS)).reverse();
    }

    const messages: RemoteMessage[] = [];
    const usedUids = new Set<number>();
    for (let i = 0; i < ids.length && messages.length < limit; i += FETCH_CONCURRENCY) {
      const batch = await Promise.all(
        ids.slice(i, i + FETCH_CONCURRENCY).map((id) => this.getMessage(id)),
      );
      for (const message of batch) {
        const remote = gmailMessageToRemote(message, input.folderRemoteId);
        if (cursor !== null && cursor >= 0 && remote.remoteUid <= cursor) {
          continue;
        }
        // Two mails delivered in the same millisecond must not share a UID
        // (unique index on account + folder + uid).
        while (usedUids.has(remote.remoteUid)) {
          remote.remoteUid += 1;
        }
        usedUids.add(remote.remoteUid);
        this.gmailIds.set(remote.remoteUid, message.id);
        messages.push(remote);
      }
      input.onProgress?.(Math.min(i + FETCH_CONCURRENCY, ids.length), Math.min(ids.length, limit));
    }

    messages.sort((a, b) => a.remoteUid - b.remoteUid);
    return { uidValidity: UID_VALIDITY, messages: messages.slice(0, limit) };
  }

  /** The `limit` messages just older than `beforeUid`, newest first (infinite scroll). */
  async fetchOlderMessages(input: FetchOlderMessagesInput): Promise<RemoteMessage[]> {
    const limit = input.limit ?? 30;
    // `before:` is exclusive with one-second granularity: include the cursor's
    // second and filter exactly below.
    const before = Math.floor(input.beforeUid / 1000) + 1;
    const ids = await this.listIds(input.folderRemoteId, `before:${before}`, limit + 10);

    const messages: RemoteMessage[] = [];
    for (let i = 0; i < ids.length && messages.length < limit; i += FETCH_CONCURRENCY) {
      const batch = await Promise.all(
        ids.slice(i, i + FETCH_CONCURRENCY).map((id) => this.getMessage(id)),
      );
      for (const message of batch) {
        const remote = gmailMessageToRemote(message, input.folderRemoteId);
        if (remote.remoteUid >= input.beforeUid) {
          continue;
        }
        this.gmailIds.set(remote.remoteUid, message.id);
        messages.push(remote);
      }
    }
    return messages.slice(0, limit);
  }

  async send(message: OutgoingMessage): Promise<SendResult> {
    let response: Response;
    try {
      response = await this.authorizedFetch('/messages/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ raw: buildRawMessage(this.emailAddress, message) }),
      });
    } catch (error) {
      // The request may have reached Google before the connection dropped.
      return {
        status: 'ambiguous',
        error: error instanceof Error ? error.message : 'Réseau indisponible',
      };
    }
    if (!response.ok) {
      return { status: 'failed', error: await describeError(response) };
    }
    const data = (await response.json()) as { id?: string };
    return { status: 'sent', remoteId: data.id ?? null };
  }

  async setRead(remoteUid: number, isRead: boolean): Promise<void> {
    await this.modifyLabels(remoteUid, isRead ? { remove: ['UNREAD'] } : { add: ['UNREAD'] });
  }

  async star(remoteUid: number, isStarred: boolean): Promise<void> {
    await this.modifyLabels(remoteUid, isStarred ? { add: ['STARRED'] } : { remove: ['STARRED'] });
  }

  async archive(remoteUid: number): Promise<void> {
    await this.modifyLabels(remoteUid, { remove: ['INBOX'] });
  }

  async moveToTrash(remoteUid: number): Promise<void> {
    const gmailId = await this.resolveGmailId(remoteUid);
    await this.request(`/messages/${gmailId}/trash`, { method: 'POST' });
  }

  /** No push channel without a server (Gmail push needs Pub/Sub): rely on polling. */
  watch(_onHint: () => void): () => void {
    return () => {};
  }

  // -------------------------------------------------------------------------

  private async listIds(label: string, query: string | null, max: number): Promise<string[]> {
    const ids: string[] = [];
    let pageToken: string | undefined;
    do {
      const params = [
        `labelIds=${encodeURIComponent(label)}`,
        ...(label === 'SPAM' || label === 'TRASH' ? ['includeSpamTrash=true'] : []),
        `maxResults=${Math.min(max - ids.length, 500)}`,
      ];
      if (query) {
        params.push(`q=${encodeURIComponent(query)}`);
      }
      if (pageToken) {
        params.push(`pageToken=${encodeURIComponent(pageToken)}`);
      }
      const data = (await this.requestJson(`/messages?${params.join('&')}`)) as {
        messages?: { id: string }[];
        nextPageToken?: string;
      };
      ids.push(...(data.messages ?? []).map((entry) => entry.id));
      pageToken = data.nextPageToken;
    } while (pageToken && ids.length < max);
    return ids;
  }

  async saveDraft(draftId: string | null, message: OutgoingMessage): Promise<string> {
    const body = JSON.stringify({ message: { raw: buildRawMessage(this.emailAddress, message) } });
    const data = (await this.requestJson(
      draftId ? `/drafts/${encodeURIComponent(draftId)}` : '/drafts',
      {
        method: draftId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      },
    )) as { id?: string };
    if (!data.id) {
      throw new GmailApiError('Brouillon non enregistré', 500);
    }
    return data.id;
  }

  async deleteDraft(draftId: string): Promise<void> {
    await this.request(`/drafts/${encodeURIComponent(draftId)}`, { method: 'DELETE' });
  }

  async listTrash(limit: number): Promise<RemoteMessage[]> {
    const ids = await this.listIds('TRASH', null, limit);
    const result: RemoteMessage[] = [];
    for (let i = 0; i < ids.length; i += FETCH_CONCURRENCY) {
      const batch = await Promise.all(
        ids.slice(i, i + FETCH_CONCURRENCY).map((id) => this.getMessage(id)),
      );
      for (const message of batch) {
        const remote = gmailMessageToRemote(message, 'TRASH');
        this.gmailIds.set(remote.remoteUid, message.id);
        result.push(remote);
      }
    }
    return result.sort((a, b) => b.receivedAt - a.receivedAt);
  }

  /**
   * `untrash` gives the mail its labels back. It is usually older than the sync
   * cursor, so it is returned for direct storage in the inbox (or Sent).
   */
  async restoreFromTrash(message: RemoteMessage): Promise<RemoteMessage | null> {
    const gmailId = await this.resolveGmailId(message.remoteUid);
    const restored = (await this.requestJson(`/messages/${gmailId}/untrash`, {
      method: 'POST',
    })) as { labelIds?: string[] };
    const labels = restored.labelIds ?? [];
    const folder = labels.includes('INBOX') ? 'INBOX' : labels.includes('SENT') ? 'SENT' : null;
    return folder ? { ...message, folderRemoteId: folder } : null;
  }

  async setSpam(remoteUid: number, isSpam: boolean): Promise<void> {
    await this.modifyLabels(
      remoteUid,
      isSpam ? { add: ['SPAM'], remove: ['INBOX'] } : { add: ['INBOX'], remove: ['SPAM'] },
    );
  }

  async fetchUnsubscribeHeaders(
    remoteUid: number,
  ): Promise<{ listUnsubscribe: string | null; listUnsubscribePost: string | null }> {
    const gmailId = await this.resolveGmailId(remoteUid);
    const data = (await this.requestJson(
      `/messages/${gmailId}?format=metadata&metadataHeaders=List-Unsubscribe&metadataHeaders=List-Unsubscribe-Post`,
    )) as GmailMessage;
    const find = (name: string) =>
      data.payload?.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ??
      null;
    return {
      listUnsubscribe: find('List-Unsubscribe'),
      listUnsubscribePost: find('List-Unsubscribe-Post'),
    };
  }

  async fetchAttachments(remoteUid: number): Promise<RemoteAttachment[]> {
    const gmailId = await this.resolveGmailId(remoteUid);
    const message = await this.getMessage(gmailId);
    return gmailMessageToRemote(message, 'INBOX').attachments ?? [];
  }

  /** Attachment content as standard base64 (Gmail returns base64url). */
  async downloadAttachment(remoteUid: number, remotePartId: string): Promise<string> {
    const gmailId = await this.resolveGmailId(remoteUid);
    const data = (await this.requestJson(
      `/messages/${gmailId}/attachments/${encodeURIComponent(remotePartId)}`,
    )) as { data?: string };
    if (!data.data) {
      throw new GmailApiError('Pièce jointe introuvable sur Gmail', 404);
    }
    const base64 = data.data.replace(/-/g, '+').replace(/_/g, '/');
    return base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  }

  private async getMessage(id: string): Promise<GmailMessage> {
    return (await this.requestJson(`/messages/${id}?format=full`)) as GmailMessage;
  }

  private async modifyLabels(
    remoteUid: number,
    change: { add?: string[]; remove?: string[] },
  ): Promise<void> {
    const gmailId = await this.resolveGmailId(remoteUid);
    await this.request(`/messages/${gmailId}/modify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ addLabelIds: change.add ?? [], removeLabelIds: change.remove ?? [] }),
    });
  }

  private async resolveGmailId(remoteUid: number): Promise<string> {
    const cached = this.gmailIds.get(remoteUid);
    if (cached) {
      return cached;
    }
    const header = await this.lookupMessageIdHeader(remoteUid);
    const messageId = header?.match(/<([^>]+)>/)?.[1] ?? header?.trim();
    if (messageId) {
      const data = (await this.requestJson(
        `/messages?maxResults=1&includeSpamTrash=true&q=${encodeURIComponent(`rfc822msgid:${messageId}`)}`,
      )) as { messages?: { id: string }[] };
      const found = data.messages?.[0]?.id;
      if (found) {
        this.gmailIds.set(remoteUid, found);
        return found;
      }
    }
    throw new GmailApiError('Message introuvable sur Gmail', 404);
  }

  private async requestJson(path: string, init?: RequestInit): Promise<unknown> {
    const response = await this.request(path, init);
    return response.json();
  }

  private async request(path: string, init?: RequestInit): Promise<Response> {
    const response = await this.authorizedFetch(path, init);
    if (!response.ok) {
      throw new GmailApiError(await describeError(response), response.status);
    }
    return response;
  }

  /** Attach the bearer token; on 401 refresh it once and retry. */
  private async authorizedFetch(path: string, init: RequestInit = {}): Promise<Response> {
    const call = async (token: string) =>
      this.fetchImpl(`${API_BASE}${path}`, {
        ...init,
        headers: {
          ...(init.headers as Record<string, string> | undefined),
          Authorization: `Bearer ${token}`,
        },
      });

    const response = await call(await this.getAccessToken());
    if (response.status !== 401) {
      return response;
    }
    return call(await this.getAccessToken(true));
  }
}

async function describeError(response: Response): Promise<string> {
  try {
    const data = (await response.json()) as { error?: { message?: string } };
    if (data.error?.message) {
      return `Gmail : ${data.error.message} (HTTP ${response.status})`;
    }
  } catch {
    // Non-JSON body.
  }
  return `Gmail : erreur HTTP ${response.status}`;
}
