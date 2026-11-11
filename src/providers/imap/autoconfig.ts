/**
 * Find the IMAP/SMTP servers of an address: known services first, then the
 * public Thunderbird database (only the domain is sent), then imap.<domain>.
 */

import {
  domainOf,
  guessSettings,
  presetForAddress,
  type MailServicePreset,
  type Security,
  type ServerSettings,
} from '@/providers/imap/presets';

export interface DiscoveredSettings {
  imap: ServerSettings;
  smtp: ServerSettings;
  source: 'preset' | 'autoconfig' | 'guess';
  preset?: MailServicePreset;
}

function parseServer(
  xml: string,
  tag: 'incomingServer' | 'outgoingServer',
  type: string,
): ServerSettings | null {
  const pattern = new RegExp(`<${tag}[^>]*type="${type}"[^>]*>([\\s\\S]*?)</${tag}>`, 'gi');
  for (const match of xml.matchAll(pattern)) {
    const block = match[1];
    const host = /<hostname>([^<]+)<\/hostname>/i.exec(block)?.[1]?.trim();
    const port = Number(/<port>(\d+)<\/port>/i.exec(block)?.[1]);
    const socket = /<socketType>([^<]+)<\/socketType>/i.exec(block)?.[1]?.trim().toUpperCase();
    if (!host || !port) continue;
    const security: Security =
      socket === 'SSL' ? 'ssl' : socket === 'STARTTLS' ? 'starttls' : 'none';
    if (security === 'none') continue; // never offer clear-text servers
    return { host, port, security };
  }
  return null;
}

/** Parse a Thunderbird autoconfig (ISPDB) document. */
export function parseAutoconfig(
  xml: string,
): { imap: ServerSettings; smtp: ServerSettings } | null {
  const imap = parseServer(xml, 'incomingServer', 'imap');
  const smtp = parseServer(xml, 'outgoingServer', 'smtp');
  return imap && smtp ? { imap, smtp } : null;
}

export async function discoverSettings(
  email: string,
  fetchImpl: typeof fetch = (...args) => fetch(...args),
): Promise<DiscoveredSettings> {
  const preset = presetForAddress(email);
  if (preset) {
    return { imap: preset.imap, smtp: preset.smtp, source: 'preset', preset };
  }
  const domain = domainOf(email);
  if (domain) {
    try {
      const response = await fetchImpl(
        `https://autoconfig.thunderbird.net/v1.1/${encodeURIComponent(domain)}`,
      );
      if (response.ok) {
        const parsed = parseAutoconfig(await response.text());
        if (parsed) return { ...parsed, source: 'autoconfig' };
      }
    } catch {
      // Offline or unknown: fall back to the usual names.
    }
  }
  return { ...guessSettings(email), source: 'guess' };
}
