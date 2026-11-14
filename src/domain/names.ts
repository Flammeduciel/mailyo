/**
 * Which name to show for an address.
 *
 * Priority:
 * 1. the name saved in the user's contacts (Google);
 * 2. the name the person uses in their own `From:` header (latest mail);
 * 3. the name given in the current header, if any;
 * 4. a name seen next to the address in To/Cc lines;
 * 5. Google's « other contacts » name (auto-collected, often a placeholder
 *    typed in some form, e.g. « Nom du destinataire »);
 * 6. nothing (callers fall back to the address).
 */

import type { EmailAddress } from '@/domain/models';

export interface NameRow {
  senderName: string;
  senderAddress: string;
  to: EmailAddress[];
  cc: EmailAddress[];
}

/** A display name worth keeping: not empty, not the address itself. */
export function meaningfulName(name: string | null | undefined, address: string): string {
  const trimmed = (name ?? '')
    .trim()
    .replace(/^["']+|["']+$/g, '')
    .trim();
  if (!trimmed) return '';
  const lower = trimmed.toLowerCase();
  if (lower === address.trim().toLowerCase() || /^[^\s@]+@[^\s@]+$/.test(lower)) return '';
  return trimmed;
}

export class NameBook {
  private readonly own = new Map<string, string>();
  private readonly seen = new Map<string, string>();

  /** Rows oldest first: later mails win. */
  static fromRows(rows: NameRow[]): NameBook {
    const book = new NameBook();
    for (const row of rows) book.add(row);
    return book;
  }

  add(row: NameRow): void {
    const own = meaningfulName(row.senderName, row.senderAddress);
    if (own) this.own.set(row.senderAddress.toLowerCase(), own);
    for (const person of [...row.to, ...row.cc]) {
      const name = meaningfulName(person.name, person.address);
      if (name) this.seen.set(person.address.toLowerCase(), name);
    }
  }

  resolve(
    address: string,
    options: {
      headerName?: string | null;
      savedName?: string | null;
      otherName?: string | null;
    } = {},
  ): string {
    const key = address.trim().toLowerCase();
    return (
      meaningfulName(options.savedName, address) ||
      this.own.get(key) ||
      meaningfulName(options.headerName, address) ||
      this.seen.get(key) ||
      meaningfulName(options.otherName, address) ||
      ''
    );
  }
}
