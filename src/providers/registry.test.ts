import { ProviderRegistry } from '@/providers/registry';
import { MockMailProvider } from '@/providers/mock/mock-mail-provider';
import type { MailProvider } from '@/providers/types';

function stubProvider(id: string): MailProvider {
  return new MockMailProvider({ emailAddress: `${id}@example.com`, provider: id });
}

describe('ProviderRegistry', () => {
  it('registers and retrieves a provider by account id', () => {
    const registry = new ProviderRegistry();
    const provider = stubProvider('gmail');

    registry.register('acc_1', provider);
    expect(registry.get('acc_1')).toBe(provider);
    expect(registry.get('unknown')).toBeUndefined();
  });

  it('getOrCreate returns the existing provider when one is registered', () => {
    const registry = new ProviderRegistry();
    const provider = stubProvider('gmail');
    registry.register('acc_1', provider);

    expect(
      registry.getOrCreate({
        accountId: 'acc_1',
        provider: 'gmail',
        emailAddress: 'a@example.com',
      }),
    ).toBe(provider);
  });

  it('getOrCreate creates and registers an empty mock provider otherwise', () => {
    const registry = new ProviderRegistry();

    const created = registry.getOrCreate({
      accountId: 'acc_2',
      provider: 'gmail',
      emailAddress: 'demo@mailyo.app',
    });
    expect(created).toBeInstanceOf(MockMailProvider);
    expect(created.id).toBe('gmail');
    expect(registry.get('acc_2')).toBe(created);
    // A second call must reuse the same instance.
    expect(
      registry.getOrCreate({
        accountId: 'acc_2',
        provider: 'gmail',
        emailAddress: 'demo@mailyo.app',
      }),
    ).toBe(created);
  });

  it('removes a registered provider', () => {
    const registry = new ProviderRegistry();
    registry.register('acc_1', stubProvider('gmail'));

    registry.remove('acc_1');
    expect(registry.get('acc_1')).toBeUndefined();
  });
});
