/**
 * Public surface of the provider layer.
 *
 * Everything the sync engine, the data layer and the UI may use lives here;
 * concrete adapters stay behind the `MailProvider` / `OAuthAdapter` contracts.
 */

export type {
  FetchMessagesInput,
  FetchMessagesResult,
  MailProvider,
  OAuthAdapter,
  OAuthTokens,
  OutgoingMessage,
  ProviderFactory,
  RemoteFolder,
  RemoteMessage,
  SendResult,
  SendStatus,
  TokenStore,
} from '@/providers/types';

export {
  MockMailProvider,
  type MockProviderOptions,
} from '@/providers/mock/mock-mail-provider';

export { ProviderRegistry, providerRegistry } from '@/providers/registry';

export { SecureTokenStore } from '@/providers/oauth/secure-token-store';

export {
  createGmailOAuthAdapter,
  type GmailOAuthConfig,
} from '@/providers/oauth/gmail-oauth';

export {
  createDemoAccount,
  createDemoFolders,
  createDemoProvider,
  createDemoRemoteMessages,
  createDemoRules,
} from '@/providers/demo/demo-data';
