/**
 * Minimal RFC 5322-ish address list parsing and formatting.
 *
 * This is intentionally not a full parser. It handles the shapes that appear in
 * real mail headers for display and rule matching: `Name <addr@host>`,
 * `"Quoted, Name" <addr@host>`, bare `addr@host`, and comma separated lists.
 */

import type { EmailAddress } from '@/domain/models';

/** Split a header on commas that are not inside quotes or angle brackets. */
function splitTopLevel(value: string): string[] {
  const parts: string[] = [];
  let current = '';
  let inQuotes = false;
  let inAngle = false;

  for (let i = 0; i < value.length; i += 1) {
    const char = value[i];
    if (char === '"' && value[i - 1] !== '\\') {
      inQuotes = !inQuotes;
      current += char;
    } else if (char === '<' && !inQuotes) {
      inAngle = true;
      current += char;
    } else if (char === '>' && !inQuotes) {
      inAngle = false;
      current += char;
    } else if (char === ',' && !inQuotes && !inAngle) {
      parts.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  if (current.trim().length > 0) {
    parts.push(current);
  }
  return parts;
}

/** Parse a single address token. Returns null when no address is present. */
export function parseAddress(value: string): EmailAddress | null {
  const token = (value ?? '').trim();
  if (token.length === 0) {
    return null;
  }

  const angle = token.match(/^(.*?)<([^>]+)>\s*$/);
  if (angle) {
    const name = angle[1]
      .trim()
      .replace(/^"(.*)"$/, '$1')
      .replace(/\\(.)/g, '$1');
    const address = angle[2].trim();
    return address.length > 0 ? { name: name || address, address } : null;
  }

  const address = token.replace(/^"(.*)"$/, '$1').trim();
  return address.includes('@') ? { name: address, address } : null;
}

/** Parse a full address-list header. Never throws. */
export function parseAddressList(header: string | null | undefined): EmailAddress[] {
  if (!header) {
    return [];
  }
  return splitTopLevel(header)
    .map(parseAddress)
    .filter((address): address is EmailAddress => address !== null);
}

/** Render an address for a header or a UI label. */
export function formatAddress(address: EmailAddress): string {
  const name = address.name?.trim();
  if (!name || name.toLowerCase() === address.address.toLowerCase()) {
    return address.address;
  }
  return `${name} <${address.address}>`;
}

/** Lower-cased domain part of an address ('@' stripped), '' when absent. */
export function extractDomain(address: string): string {
  const raw = (address ?? '').trim();
  // Accept both a bare address and a formatted "Name <addr>" value.
  const angle = raw.match(/<([^>]+)>/);
  const bare = (angle ? angle[1] : raw).trim();
  const at = bare.lastIndexOf('@');
  if (at < 0) {
    return '';
  }
  return bare
    .slice(at + 1)
    .replace(/[>\s]+$/, '')
    .trim()
    .toLowerCase();
}

/** Case-insensitive comparison of two addresses. */
export function isSameAddress(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** True when the address belongs to the given identity (self). */
export function isSelf(address: string, self: string): boolean {
  return isSameAddress(address, self);
}
