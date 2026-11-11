/**
 * Recipient suggestions for the compose screen: ranking and accent-insensitive
 * matching on name or address.
 */

export interface ContactSuggestion {
  name: string;
  address: string;
  /** Messages exchanged; 0 for a saved contact never written to. */
  count: number;
  lastAt: number | null;
}

/**
 * Addresses that do not accept replies (no-reply, mailer-daemon…): never
 * suggested as recipients, and the conversation hides its composer.
 */
export function isNoReplyAddress(email: string): boolean {
  const local = email.toLowerCase().split('@')[0] ?? '';
  return /^(no[._-]?reply|do[._-]?not[._-]?reply|noreply|ne[._-]?pas[._-]?repondre|mailer[._-]?daemon|postmaster|bounces?|notifications?[._-]?no[._-]?reply)([._+-].*)?$/.test(
    local,
  );
}

export function normalizeForSearch(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

/**
 * Contacts matching `query`: names or addresses starting with it come first
 * (« cl » → Claire before Nicolas), then those containing it. Empty query
 * keeps the original order (most recent first).
 */
export function filterContacts(
  contacts: ContactSuggestion[],
  query: string,
  exclude: string[] = [],
): ContactSuggestion[] {
  const excluded = new Set(exclude.map((address) => address.toLowerCase()));
  const pool = contacts.filter((contact) => !excluded.has(contact.address.toLowerCase()));
  const needle = normalizeForSearch(query);
  if (!needle) {
    return pool;
  }
  const scored: { contact: ContactSuggestion; score: number }[] = [];
  for (const contact of pool) {
    const name = normalizeForSearch(contact.name);
    const address = normalizeForSearch(contact.address);
    const words = `${name} ${address.split('@')[0]}`.split(/[\s._-]+/);
    let score = -1;
    if (words.some((word) => word.startsWith(needle)) || address.startsWith(needle)) score = 2;
    else if (name.includes(needle) || address.includes(needle)) score = 1;
    if (score > 0) scored.push({ contact, score });
  }
  return scored.sort((a, b) => b.score - a.score).map((entry) => entry.contact);
}
