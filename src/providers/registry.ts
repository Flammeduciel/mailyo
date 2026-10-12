/**
 * In-process registry mapping an account to its live `MailProvider`.
 *
 * The MVP only ever builds `MockMailProvider` instances; the registry keeps the
 * rest of the app provider-agnostic so the real Gmail/IMAP adapters (Phase 0)
 * can be plugged in without touching the sync engine or the UI.
 */

import type { ProviderId } from '@/domain/models';
import type { MailProvider } from '@/providers/types';
import { MockMailProvider } from '@/providers/mock/mock-mail-provider';

export class ProviderRegistry {
  private readonly providers = new Map<string, MailProvider>();

  register(accountId: string, provider: MailProvider): void {
    this.providers.set(accountId, provider);
  }

  get(accountId: string): MailProvider | undefined {
    return this.providers.get(accountId);
  }

  /**
   * Return the provider registered for the account, or create and register an
   * empty `MockMailProvider` when none exists yet.
   */
  getOrCreate(input: { accountId: string; provider: ProviderId; emailAddress: string }): MailProvider {
    const existing = this.providers.get(input.accountId);
    if (existing) {
      return existing;
    }
    const provider = new MockMailProvider({
      emailAddress: input.emailAddress,
      provider: input.provider,
    });
    this.providers.set(input.accountId, provider);
    return provider;
  }

  remove(accountId: string): void {
    this.providers.delete(accountId);
  }
}

/** Shared registry used by the application. */
export const providerRegistry = new ProviderRegistry();
