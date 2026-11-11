/**
 * IMAP accounts: server settings and password, kept together in the device's
 * secure storage (never in SQLite).
 */

import * as SecureStore from 'expo-secure-store';

import type { ServerSettings } from '@/providers/imap/presets';

export interface ImapAccountConfig {
  username: string;
  password: string;
  imap: ServerSettings;
  smtp: ServerSettings;
  /** Preset id when the account was created from a known service. */
  serviceId?: string;
}

export interface ImapCredentialStore {
  save(accountId: string, config: ImapAccountConfig): Promise<void>;
  load(accountId: string): Promise<ImapAccountConfig | null>;
  remove(accountId: string): Promise<void>;
}

const keyFor = (accountId: string) => `mailyo.imap.${accountId.replace(/[^A-Za-z0-9._-]/g, '_')}`;

export class SecureImapCredentialStore implements ImapCredentialStore {
  async save(accountId: string, config: ImapAccountConfig): Promise<void> {
    await SecureStore.setItemAsync(keyFor(accountId), JSON.stringify(config));
  }

  async load(accountId: string): Promise<ImapAccountConfig | null> {
    const raw = await SecureStore.getItemAsync(keyFor(accountId));
    if (!raw) return null;
    try {
      return JSON.parse(raw) as ImapAccountConfig;
    } catch {
      return null;
    }
  }

  async remove(accountId: string): Promise<void> {
    await SecureStore.deleteItemAsync(keyFor(accountId));
  }
}
