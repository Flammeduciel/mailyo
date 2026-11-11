/**
 * Mail services MailYo connects to over IMAP/SMTP, with their server settings
 * and how to get an app password. Shown with their logo on the login screen.
 */

export type Security = 'ssl' | 'starttls' | 'none';

export interface ServerSettings {
  host: string;
  port: number;
  security: Security;
}

export interface MailServicePreset {
  id: string;
  name: string;
  /** Address domains served (used to recognise a typed address). */
  domains: string[];
  imap: ServerSettings;
  smtp: ServerSettings;
  /** The service refuses the normal password: an app password is required. */
  appPasswordRequired: boolean;
  /** Where to create the app password, and a one-line hint. */
  appPasswordUrl?: string;
  hint?: string;
  /** Brand colour and short monogram for the logo tile. */
  color: string;
  monogram: string;
}

export const MAIL_SERVICES: MailServicePreset[] = [
  {
    id: 'yahoo',
    name: 'Yahoo Mail',
    domains: ['yahoo.com', 'yahoo.fr', 'ymail.com', 'rocketmail.com'],
    imap: { host: 'imap.mail.yahoo.com', port: 993, security: 'ssl' },
    smtp: { host: 'smtp.mail.yahoo.com', port: 465, security: 'ssl' },
    appPasswordRequired: true,
    appPasswordUrl: 'https://login.yahoo.com/account/security/app-passwords',
    hint: 'Sécurité du compte › Mot de passe d’application',
    color: '#6001D2',
    monogram: 'Y!',
  },
  {
    id: 'icloud',
    name: 'iCloud Mail',
    domains: ['icloud.com', 'me.com', 'mac.com'],
    imap: { host: 'imap.mail.me.com', port: 993, security: 'ssl' },
    smtp: { host: 'smtp.mail.me.com', port: 587, security: 'starttls' },
    appPasswordRequired: true,
    appPasswordUrl: 'https://account.apple.com/account/manage',
    hint: 'Connexion et sécurité › Mots de passe pour app',
    color: '#0A84FF',
    monogram: '',
  },
  {
    id: 'orange',
    name: 'Orange',
    domains: ['orange.fr', 'wanadoo.fr'],
    imap: { host: 'imap.orange.fr', port: 993, security: 'ssl' },
    smtp: { host: 'smtp.orange.fr', port: 465, security: 'ssl' },
    appPasswordRequired: false,
    color: '#FF7900',
    monogram: 'O',
  },
  {
    id: 'free',
    name: 'Free',
    domains: ['free.fr'],
    imap: { host: 'imap.free.fr', port: 993, security: 'ssl' },
    smtp: { host: 'smtp.free.fr', port: 465, security: 'ssl' },
    appPasswordRequired: false,
    color: '#CD1E25',
    monogram: 'F',
  },
  {
    id: 'sfr',
    name: 'SFR',
    domains: ['sfr.fr', 'neuf.fr', 'cegetel.net'],
    imap: { host: 'imap.sfr.fr', port: 993, security: 'ssl' },
    smtp: { host: 'smtp.sfr.fr', port: 465, security: 'ssl' },
    appPasswordRequired: false,
    color: '#E2001A',
    monogram: 'SFR',
  },
  {
    id: 'laposte',
    name: 'La Poste',
    domains: ['laposte.net'],
    imap: { host: 'imap.laposte.net', port: 993, security: 'ssl' },
    smtp: { host: 'smtp.laposte.net', port: 465, security: 'ssl' },
    appPasswordRequired: false,
    color: '#FFC90E',
    monogram: 'LP',
  },
  {
    id: 'gmx',
    name: 'GMX',
    domains: ['gmx.fr', 'gmx.com', 'gmx.net', 'gmx.de'],
    imap: { host: 'imap.gmx.net', port: 993, security: 'ssl' },
    smtp: { host: 'mail.gmx.net', port: 587, security: 'starttls' },
    appPasswordRequired: false,
    hint: 'Activez l’accès IMAP dans les paramètres GMX',
    color: '#1C449B',
    monogram: 'GMX',
  },
  {
    id: 'zoho',
    name: 'Zoho Mail',
    domains: ['zoho.com', 'zohomail.com', 'zoho.eu'],
    imap: { host: 'imap.zoho.eu', port: 993, security: 'ssl' },
    smtp: { host: 'smtp.zoho.eu', port: 465, security: 'ssl' },
    appPasswordRequired: false,
    hint: 'Activez l’accès IMAP dans Zoho Mail',
    color: '#E42527',
    monogram: 'Z',
  },
  {
    id: 'fastmail',
    name: 'Fastmail',
    domains: ['fastmail.com', 'fastmail.fm'],
    imap: { host: 'imap.fastmail.com', port: 993, security: 'ssl' },
    smtp: { host: 'smtp.fastmail.com', port: 465, security: 'ssl' },
    appPasswordRequired: true,
    appPasswordUrl: 'https://app.fastmail.com/settings/security/devicekeys',
    hint: 'Paramètres › Confidentialité et sécurité › Mots de passe d’app',
    color: '#0067B9',
    monogram: 'FM',
  },
  {
    id: 'ovh',
    name: 'OVHcloud',
    domains: [],
    imap: { host: 'ssl0.ovh.net', port: 993, security: 'ssl' },
    smtp: { host: 'ssl0.ovh.net', port: 465, security: 'ssl' },
    appPasswordRequired: false,
    hint: 'Pour une adresse sur votre propre domaine hébergé chez OVH',
    color: '#123F6D',
    monogram: 'OVH',
  },
];

/** Shown greyed out with « Bientôt disponible » until Microsoft Graph lands. */
export const COMING_SOON_SERVICES = [
  { id: 'outlook', name: 'Outlook / Hotmail', color: '#0078D4', monogram: 'O' },
  { id: 'microsoft365', name: 'Microsoft 365', color: '#D83B01', monogram: 'M' },
];

export function domainOf(email: string): string {
  return email.trim().toLowerCase().split('@')[1] ?? '';
}

/** Known service for an address, by its domain. */
export function presetForAddress(email: string): MailServicePreset | undefined {
  const domain = domainOf(email);
  return MAIL_SERVICES.find((service) => service.domains.includes(domain));
}

/** Addresses on Microsoft domains (Outlook support comes later). */
export function isMicrosoftAddress(email: string): boolean {
  return /^(outlook|hotmail|live|msn)\.[a-z.]+$/.test(domainOf(email));
}

/** Last resort when the domain is unknown: the usual imap.<domain> / smtp.<domain>. */
export function guessSettings(email: string): { imap: ServerSettings; smtp: ServerSettings } {
  const domain = domainOf(email);
  return {
    imap: { host: `imap.${domain}`, port: 993, security: 'ssl' },
    smtp: { host: `smtp.${domain}`, port: 465, security: 'ssl' },
  };
}
