/**
 * Pure helpers for the Gmail REST API: base64url and UTF-8 codecs, decoding of
 * the `users.messages.get?format=full` payload into a `RemoteMessage`, and
 * encoding of an outgoing message as the RFC 5322 `raw` field of
 * `users.messages.send`.
 *
 * Kept free of network and React so it can be unit tested in isolation.
 */

import type { EmailAddress, MailCategory } from '@/domain/models';
import { parseAddress, parseAddressList } from '@/domain/mime';
import type { OutgoingMessage, RemoteAttachment, RemoteMessage } from '@/providers/types';

// ---------------------------------------------------------------------------
// Byte codecs
// ---------------------------------------------------------------------------

/** Decode base64 / base64url (padding optional) into raw bytes. */
export function base64ToBytes(input: string): Uint8Array {
  const normalized = input
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .replace(/[^A-Za-z0-9+/]/g, '');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/** Encode raw bytes as standard base64 (with padding). */
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/** Encode raw bytes as unpadded base64url, the format Gmail expects for `raw`. */
export function bytesToBase64Url(bytes: Uint8Array): string {
  return bytesToBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** UTF-8 encode a JS string (surrogate pairs handled). */
export function utf8Encode(input: string): Uint8Array {
  const out: number[] = [];
  for (const char of input) {
    const code = char.codePointAt(0) ?? 0;
    if (code < 0x80) {
      out.push(code);
    } else if (code < 0x800) {
      out.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    } else if (code < 0x10000) {
      out.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    } else {
      out.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 0x3f),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f),
      );
    }
  }
  return Uint8Array.from(out);
}

/** Lenient UTF-8 decoder: invalid sequences become U+FFFD instead of throwing. */
export function utf8Decode(bytes: Uint8Array): string {
  let out = '';
  let i = 0;
  while (i < bytes.length) {
    const byte = bytes[i];
    let code: number;
    let extra: number;
    if (byte < 0x80) {
      code = byte;
      extra = 0;
    } else if (byte >= 0xc2 && byte < 0xe0) {
      code = byte & 0x1f;
      extra = 1;
    } else if (byte >= 0xe0 && byte < 0xf0) {
      code = byte & 0x0f;
      extra = 2;
    } else if (byte >= 0xf0 && byte < 0xf5) {
      code = byte & 0x07;
      extra = 3;
    } else {
      out += '\uFFFD';
      i += 1;
      continue;
    }
    // A missing continuation byte (truncated buffer) reads as `undefined`.
    let valid = true;
    for (let k = 1; k <= extra; k += 1) {
      const next = bytes[i + k];
      if (next === undefined || (next & 0xc0) !== 0x80) {
        valid = false;
        break;
      }
      code = (code << 6) | (next & 0x3f);
    }
    if (!valid) {
      out += '\uFFFD';
      i += 1;
      continue;
    }
    out += String.fromCodePoint(code);
    i += extra + 1;
  }
  return out;
}

/** Windows-1252 code points for bytes 0x80–0x9F (the rest matches Latin-1). */
const CP1252_HIGH = [
  0x20ac, 0x81, 0x201a, 0x192, 0x201e, 0x2026, 0x2020, 0x2021, 0x2c6, 0x2030, 0x160, 0x2039, 0x152,
  0x8d, 0x17d, 0x8f, 0x90, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x2dc, 0x2122,
  0x161, 0x203a, 0x153, 0x9d, 0x17e, 0x178,
];

/** Decode bytes in the given MIME charset. Unknown charsets fall back to UTF-8. */
export function decodeCharset(bytes: Uint8Array, charset: string | null): string {
  const name = (charset ?? 'utf-8').trim().toLowerCase().replace(/^"|"$/g, '');
  if (
    ['iso-8859-1', 'latin1', 'iso-8859-15', 'windows-1252', 'cp1252', 'us-ascii'].includes(name)
  ) {
    let out = '';
    for (const byte of bytes) {
      out += String.fromCharCode(byte >= 0x80 && byte < 0xa0 ? CP1252_HIGH[byte - 0x80] : byte);
    }
    return out;
  }
  return utf8Decode(bytes);
}

// ---------------------------------------------------------------------------
// Headers
// ---------------------------------------------------------------------------

/**
 * Decode RFC 2047 encoded words (`=?UTF-8?B?…?=`). Gmail usually returns
 * headers already decoded; this is a safety net for the ones it does not.
 */
export function decodeEncodedWords(value: string): string {
  return value
    .replace(/(\?=)\s+(=\?)/g, '$1$2')
    .replace(
      /=\?([^?]+)\?([bBqQ])\?([^?]*)\?=/g,
      (_match, charset: string, kind: string, text: string) => {
        try {
          if (kind.toUpperCase() === 'B') {
            return decodeCharset(base64ToBytes(text), charset);
          }
          const bytes: number[] = [];
          const source = text.replace(/_/g, ' ');
          for (let i = 0; i < source.length; i += 1) {
            if (source[i] === '=' && /^[0-9A-Fa-f]{2}$/.test(source.slice(i + 1, i + 3))) {
              bytes.push(parseInt(source.slice(i + 1, i + 3), 16));
              i += 2;
            } else {
              bytes.push(source.charCodeAt(i));
            }
          }
          return decodeCharset(Uint8Array.from(bytes), charset);
        } catch {
          return text;
        }
      },
    );
}

export interface GmailHeader {
  name: string;
  value: string;
}

function header(headers: GmailHeader[] | undefined, name: string): string | null {
  const found = headers?.find((entry) => entry.name.toLowerCase() === name.toLowerCase());
  return found ? decodeEncodedWords(found.value) : null;
}

function charsetOf(contentType: string | null): string | null {
  const match = contentType?.match(/charset\s*=\s*"?([^";\s]+)"?/i);
  return match ? match[1] : null;
}

// ---------------------------------------------------------------------------
// Incoming messages
// ---------------------------------------------------------------------------

export interface GmailMessagePart {
  mimeType?: string;
  filename?: string;
  headers?: GmailHeader[];
  body?: { data?: string; size?: number; attachmentId?: string };
  parts?: GmailMessagePart[];
}

/** Subset of the `users.messages` resource used by MailYo. */
export interface GmailMessage {
  id: string;
  threadId?: string;
  labelIds?: string[];
  internalDate?: string;
  payload?: GmailMessagePart;
}

interface ExtractedBody {
  text: string | null;
  html: string | null;
  hasAttachments: boolean;
  attachments: RemoteAttachment[];
}

function walkParts(part: GmailMessagePart, acc: ExtractedBody): void {
  const mimeType = (part.mimeType ?? '').toLowerCase();
  const isAttachment = Boolean(part.filename) || Boolean(part.body?.attachmentId);

  if (part.parts && part.parts.length > 0) {
    for (const child of part.parts) {
      walkParts(child, acc);
    }
    return;
  }
  if (isAttachment) {
    acc.hasAttachments = true;
    acc.attachments.push({
      filename: part.filename || 'Pièce jointe',
      mimeType: part.mimeType || 'application/octet-stream',
      sizeBytes: part.body?.size ?? 0,
      remotePartId: part.body?.attachmentId ?? null,
    });
    return;
  }
  const data = part.body?.data;
  if (!data) {
    return;
  }
  const decoded = decodeCharset(
    base64ToBytes(data),
    charsetOf(header(part.headers, 'Content-Type')),
  );
  if (mimeType === 'text/plain' && acc.text === null) {
    acc.text = decoded;
  } else if (mimeType === 'text/html' && acc.html === null) {
    acc.html = decoded;
  }
}

/**
 * Map a Gmail message onto the provider-neutral `RemoteMessage`.
 *
 * `remoteUid` is the message's `internalDate` (ms): it is a safe integer, it
 * grows with arrival time — which is what the sync cursor needs — and it is
 * identical in every label, so a mail in INBOX and SENT keeps one identity.
 */
export function gmailMessageToRemote(message: GmailMessage, folderRemoteId: string): RemoteMessage {
  const headers = message.payload?.headers;
  const from = parseAddress(header(headers, 'From') ?? '') ?? { name: '', address: '' };
  const body: ExtractedBody = { text: null, html: null, hasAttachments: false, attachments: [] };
  if (message.payload) {
    walkParts(message.payload, body);
  }
  const labels = message.labelIds ?? [];
  const receivedAt = Number(message.internalDate ?? '0');

  return {
    remoteUid: receivedAt,
    folderRemoteId,
    messageIdHeader: header(headers, 'Message-ID') ?? header(headers, 'Message-Id'),
    inReplyTo: header(headers, 'In-Reply-To'),
    referencesHeader: header(headers, 'References'),
    senderName: from.name,
    senderAddress: from.address,
    to: parseAddressList(header(headers, 'To')),
    cc: parseAddressList(header(headers, 'Cc')),
    subject: header(headers, 'Subject') ?? '',
    bodyText: body.text ?? '',
    bodyHtml: body.html,
    receivedAt,
    isRead: !labels.includes('UNREAD'),
    isStarred: labels.includes('STARRED'),
    hasAttachments: body.hasAttachments,
    attachments: body.attachments,
    category: gmailCategory(labels),
  };
}

const CATEGORY_LABELS: Record<string, MailCategory> = {
  CATEGORY_PERSONAL: 'primary',
  CATEGORY_SOCIAL: 'social',
  CATEGORY_PROMOTIONS: 'promotions',
  CATEGORY_UPDATES: 'updates',
  CATEGORY_FORUMS: 'forums',
};

/**
 * Gmail tab of a message. Inbox mail without a category label is "Principale";
 * mail outside the inbox (sent) has none.
 */
export function gmailCategory(labels: string[]): MailCategory | null {
  for (const label of labels) {
    const category = CATEGORY_LABELS[label];
    if (category) {
      return category;
    }
  }
  return labels.includes('INBOX') ? 'primary' : null;
}

// ---------------------------------------------------------------------------
// Outgoing messages
// ---------------------------------------------------------------------------

const NON_ASCII = /[^\x00-\x7f]/;

/** RFC 2047 B-encode a header value when it contains non-ASCII characters. */
export function encodeHeaderValue(value: string): string {
  if (!NON_ASCII.test(value)) {
    return value;
  }
  return `=?UTF-8?B?${bytesToBase64(utf8Encode(value))}?=`;
}

function formatHeaderAddress(address: EmailAddress): string {
  const name = address.name?.trim();
  if (!name || name.toLowerCase() === address.address.toLowerCase()) {
    return address.address;
  }
  const encoded = NON_ASCII.test(name)
    ? encodeHeaderValue(name)
    : `"${name.replace(/["\\]/g, '\\$&')}"`;
  return `${encoded} <${address.address}>`;
}

function formatAddressHeader(addresses: EmailAddress[]): string {
  return addresses.map(formatHeaderAddress).join(', ');
}

/** Build the base64url `raw` RFC 5322 message expected by `users.messages.send`. */
export function buildRawMessage(from: string, message: OutgoingMessage): string {
  const lines = [`From: ${from}`];
  if (message.to.length > 0) {
    lines.push(`To: ${formatAddressHeader(message.to)}`);
  }
  if (message.cc.length > 0) {
    lines.push(`Cc: ${formatAddressHeader(message.cc)}`);
  }
  if (message.bcc.length > 0) {
    lines.push(`Bcc: ${formatAddressHeader(message.bcc)}`);
  }
  lines.push(`Subject: ${encodeHeaderValue(message.subject)}`);
  if (message.inReplyTo) {
    lines.push(`In-Reply-To: ${message.inReplyTo}`);
  }
  if (message.references) {
    lines.push(`References: ${message.references}`);
  }
  const wrap = (base64: string) => base64.match(/.{1,76}/g)?.join('\r\n') ?? '';
  const body = wrap(bytesToBase64(utf8Encode(message.bodyText.replace(/\r?\n/g, '\r\n'))));
  const attachments = message.attachments ?? [];

  if (attachments.length === 0) {
    lines.push(
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset=UTF-8',
      'Content-Transfer-Encoding: base64',
      '',
    );
    return bytesToBase64Url(utf8Encode(`${lines.join('\r\n')}\r\n${body}\r\n`));
  }

  const boundary = `mailyo_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
  lines.push('MIME-Version: 1.0', `Content-Type: multipart/mixed; boundary="${boundary}"`, '');
  const parts = [
    `--${boundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    body,
  ];
  for (const attachment of attachments) {
    const name = encodeHeaderValue(attachment.filename).replace(/"/g, '');
    parts.push(
      `--${boundary}`,
      `Content-Type: ${attachment.mimeType || 'application/octet-stream'}; name="${name}"`,
      `Content-Disposition: attachment; filename="${name}"`,
      'Content-Transfer-Encoding: base64',
      '',
      wrap(attachment.base64.replace(/\s+/g, '')),
    );
  }
  parts.push(`--${boundary}--`, '');
  return bytesToBase64Url(utf8Encode(`${lines.join('\r\n')}\r\n${parts.join('\r\n')}`));
}
