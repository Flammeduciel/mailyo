/**
 * Chat bubbles from quoted history.
 *
 * A reply often carries messages the phone never received (sent from another
 * mailbox, deleted, older than the sync window). They only live in its quoted
 * history: « Le ven. 20 nov. 2026, 11:07, Flamme a écrit : … ». Each of those
 * becomes a bubble of its own, at its date, from its author, like a chat app,
 * unless the conversation already holds that message.
 */

import { tidyPlainText } from '@/domain/plain-text';
import { parseQuoteBlock, quoteOnlyText, splitQuotedText } from '@/domain/quote';

export interface HistoryBubble {
  /** Stable id: `hist:` + quoting message id + depth. */
  id: string;
  /** The real message whose history it comes from. */
  sourceId: string;
  senderName: string;
  senderAddress: string;
  text: string;
  receivedAt: number;
  /** True when the date was read from the attribution line. */
  dated: boolean;
}

interface MessageLike {
  id: string;
  bodyText: string;
  receivedAt: number;
  senderName: string;
  senderAddress: string;
}

const MONTHS: Record<string, number> = {
  janv: 0,
  jan: 0,
  janvier: 0,
  january: 0,
  fevr: 1,
  févr: 1,
  fev: 1,
  fév: 1,
  feb: 1,
  fevrier: 1,
  février: 1,
  february: 1,
  mars: 2,
  mar: 2,
  march: 2,
  avr: 3,
  avril: 3,
  apr: 3,
  april: 3,
  mai: 4,
  may: 4,
  juin: 5,
  jun: 5,
  june: 5,
  juil: 6,
  juillet: 6,
  jul: 6,
  july: 6,
  aout: 7,
  août: 7,
  aug: 7,
  august: 7,
  sept: 8,
  sep: 8,
  septembre: 8,
  september: 8,
  oct: 9,
  octobre: 9,
  october: 9,
  nov: 10,
  novembre: 10,
  november: 10,
  dec: 11,
  déc: 11,
  decembre: 11,
  décembre: 11,
  december: 11,
};

/**
 * Dates as mail clients write them in attribution lines, local time:
 * « ven. 20 nov. 2026, 11:07 », « jeu. 5 nov. 2026 à 23:02 »,
 * « Mon, Jan 5, 2026 at 9:00 AM », « 20/11/2026 11:07 ». Null when unknown.
 */
export function parseAttributionDate(text: string | null): number | null {
  if (!text) return null;
  const value = text.toLowerCase().replace(/ /g, ' ');
  const time = /(\d{1,2})\s*[:h]\s*(\d{2})(?:\s*([ap])\.?\s*m\.?)?/.exec(value);
  let hours = time ? Number(time[1]) : 0;
  const minutes = time ? Number(time[2]) : 0;
  if (time?.[3] === 'p' && hours < 12) hours += 12;
  if (time?.[3] === 'a' && hours === 12) hours = 0;
  const dateless = time ? value.replace(time[0], ' ') : value;

  let day: number | null = null;
  let month: number | null = null;
  let year: number | null = null;
  const numeric = /(\d{1,2})[/.](\d{1,2})[/.](\d{4})/.exec(dateless);
  if (numeric) {
    day = Number(numeric[1]);
    month = Number(numeric[2]) - 1;
    year = Number(numeric[3]);
  } else {
    const words = dateless.match(/[a-zàâäéèêëîïôöûüç]+|\d+/g) ?? [];
    for (const word of words) {
      if (/^\d{4}$/.test(word)) year = Number(word);
      else if (/^\d{1,2}$/.test(word) && day === null) day = Number(word);
      else if (month === null && MONTHS[word] !== undefined) month = MONTHS[word];
    }
  }
  if (day === null || month === null || year === null) return null;
  const date = new Date(year, month, day, hours, minutes);
  return Number.isNaN(date.getTime()) || date.getDate() !== day ? null : date.getTime();
}

function normalize(value: string): string {
  return value.replace(/\s+/g, ' ').trim().toLowerCase();
}

/** Own text of a message, without its quoted history. */
function ownText(bodyText: string): string {
  return normalize(splitQuotedText(bodyText).body);
}

/** Same text, give or take reflowed lines and a signature. */
function sameText(a: string, b: string): boolean {
  if (!a || !b) return false;
  const probe = (value: string) => value.slice(0, 60);
  return a.startsWith(probe(b)) || b.startsWith(probe(a));
}

const MAX_DEPTH = 40;

/**
 * Bubbles for the quoted messages that are not in the conversation, plus the
 * ids of the messages whose whole history is now on screen (their « Historique »
 * link has nothing left to show).
 */
export function historyBubbles(messages: readonly MessageLike[]): {
  bubbles: HistoryBubble[];
  covered: Set<string>;
} {
  const known = messages.map((message) => ({
    text: ownText(message.bodyText),
    at: message.receivedAt,
  }));
  const bubbles: HistoryBubble[] = [];
  const covered = new Set<string>();

  // Newest first: the latest reply holds the longest history.
  const ordered = [...messages].sort((a, b) => b.receivedAt - a.receivedAt);
  for (const message of ordered) {
    // A reply made only of a quote already shows it as a card.
    if (quoteOnlyText(message.bodyText)) continue;
    let next: string | null = splitQuotedText(message.bodyText).quoted;
    if (!next) continue;
    let ceiling = message.receivedAt;
    let complete = true;
    for (let depth = 0; next && depth < MAX_DEPTH; depth += 1) {
      const block = parseQuoteBlock(next);
      const split = splitQuotedText(block.text);
      const text = tidyPlainText(split.body).trim();
      next = split.quoted;
      if (!text) continue;
      const normalized = normalize(text);
      const already =
        known.some((entry) => sameText(entry.text, normalized)) ||
        bubbles.some((bubble) => sameText(normalize(bubble.text), normalized));
      if (already) continue;
      if (!block.author && !block.address) {
        // An anonymous "> " block: no author to put on a bubble.
        complete = false;
        continue;
      }
      const parsed = parseAttributionDate(block.date);
      // A quoted message cannot be newer than the reply quoting it.
      const dated = parsed !== null && parsed <= ceiling + 60_000;
      const receivedAt = dated ? (parsed as number) : ceiling - 1;
      ceiling = receivedAt;
      const bubble: HistoryBubble = {
        id: `hist:${message.id}:${depth}`,
        sourceId: message.id,
        senderName: block.author ?? block.address ?? '',
        senderAddress: block.address ?? '',
        text,
        receivedAt,
        dated,
      };
      bubbles.push(bubble);
      known.push({ text: normalized, at: receivedAt });
    }
    if (complete) covered.add(message.id);
  }
  return { bubbles: bubbles.sort((a, b) => a.receivedAt - b.receivedAt), covered };
}
