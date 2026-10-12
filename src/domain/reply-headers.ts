/**
 * Build the recipient/subject/reference headers for a reply, reply-all or
 * forward. Kept pure so it can be unit tested without any mail transport.
 */

import type { EmailAddress, Message } from '@/domain/models';
import { isSelf } from '@/domain/mime';
import { hasSubjectPrefix } from '@/domain/subject';
import { formatMessageId, parseMessageIds } from '@/domain/threading';

export type ReplyMode = 'reply' | 'replyAll' | 'forward';

export interface ComposeHeaders {
  to: EmailAddress[];
  cc: EmailAddress[];
  subject: string;
  inReplyTo: string | null;
  references: string | null;
}

const FORWARD_PREFIX = /^\s*fwd?\s*:/i;

function buildSubject(subject: string, mode: ReplyMode): string {
  const base = subject ?? '';
  if (mode === 'forward') {
    return FORWARD_PREFIX.test(base) ? base : `Fwd: ${base}`;
  }
  return hasSubjectPrefix(base) ? base : `Re: ${base}`;
}

function dedupeAddresses(addresses: EmailAddress[], self: string): EmailAddress[] {
  const seen = new Set<string>();
  const result: EmailAddress[] = [];
  for (const address of addresses) {
    const key = address.address.trim().toLowerCase();
    if (key.length === 0 || seen.has(key) || isSelf(address.address, self)) {
      continue;
    }
    seen.add(key);
    result.push(address);
  }
  return result;
}

/**
 * @param message the message being answered
 * @param selfAddress the account address (excluded from reply-all recipients)
 */
export function buildReplyHeaders(
  message: Message,
  selfAddress: string,
  mode: ReplyMode,
): ComposeHeaders {
  const sender: EmailAddress = {
    name: message.senderName || message.senderAddress,
    address: message.senderAddress,
  };

  if (mode === 'forward') {
    return {
      to: [],
      cc: [],
      subject: buildSubject(message.subject, mode),
      inReplyTo: null,
      references: null,
    };
  }

  const to = [sender];
  const cc: EmailAddress[] = [];

  if (mode === 'replyAll') {
    const others = dedupeAddresses([...message.to, ...message.cc], selfAddress).filter(
      (address) => address.address.trim().toLowerCase() !== sender.address.trim().toLowerCase(),
    );
    cc.push(...others);
  }

  const ownId = message.messageIdHeader ? parseMessageIds(message.messageIdHeader) : [];
  const references = [...parseMessageIds(message.referencesHeader), ...ownId];

  return {
    to,
    cc,
    subject: buildSubject(message.subject, mode),
    inReplyTo: ownId.length > 0 ? formatMessageId(ownId[0]) : null,
    references: references.length > 0 ? references.map(formatMessageId).join(' ') : null,
  };
}
