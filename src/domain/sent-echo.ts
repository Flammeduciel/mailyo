/**
 * Sent-mail echoes.
 *
 * Right after sending, MailYo stores a local copy of the message (no server
 * UID yet) so it shows in the conversation at once. The next sync brings the
 * same mail back from the server's Sent folder (and sometimes the inbox). That
 * copy must replace the local one, not sit next to it.
 *
 * Matching is by Message-ID when the server kept ours; Gmail may rewrite it, so
 * we also accept: same sender, close in time, same subject, and a server body
 * that starts with what we typed (the server copy may carry the quoted history).
 */

import { parseMessageIds } from '@/domain/threading';
import { splitQuotedText } from '@/domain/quote';
import { normalizeSubject } from '@/domain/subject';

/** How far apart the local copy and the server copy can be dated. */
export const SENT_ECHO_WINDOW_MS = 30 * 60 * 1000;

export interface EchoCandidate {
  messageIdHeader: string | null;
  senderAddress: string;
  subject: string;
  bodyText: string;
  receivedAt: number;
}

function core(text: string): string {
  return splitQuotedText(text).body.replace(/\s+/g, ' ').trim().toLowerCase();
}

/** True when `remote` (from the server) is the same mail as the local `placeholder`. */
export function isSentEcho(placeholder: EchoCandidate, remote: EchoCandidate): boolean {
  const localIds = parseMessageIds(placeholder.messageIdHeader ?? '');
  const remoteIds = parseMessageIds(remote.messageIdHeader ?? '');
  if (localIds.length > 0 && localIds.some((id) => remoteIds.includes(id))) {
    return true;
  }
  if (placeholder.senderAddress.toLowerCase() !== remote.senderAddress.toLowerCase()) {
    return false;
  }
  if (Math.abs(placeholder.receivedAt - remote.receivedAt) > SENT_ECHO_WINDOW_MS) {
    return false;
  }
  if (normalizeSubject(placeholder.subject) !== normalizeSubject(remote.subject)) {
    return false;
  }
  const typed = core(placeholder.bodyText);
  const server = core(remote.bodyText);
  if (typed.length === 0) {
    return server.length === 0;
  }
  return server === typed || server.startsWith(typed);
}

/** Index of the placeholder `remote` replaces (closest in time), or -1. */
export function findSentEcho(placeholders: EchoCandidate[], remote: EchoCandidate): number {
  let best = -1;
  let bestGap = Number.POSITIVE_INFINITY;
  placeholders.forEach((placeholder, index) => {
    if (!isSentEcho(placeholder, remote)) return;
    const gap = Math.abs(placeholder.receivedAt - remote.receivedAt);
    if (gap < bestGap) {
      best = index;
      bestGap = gap;
    }
  });
  return best;
}
