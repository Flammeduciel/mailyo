import {
  createDemoAccount,
  createDemoFolders,
  createDemoProvider,
  createDemoRemoteMessages,
  createDemoRules,
} from '@/providers/demo/demo-data';
import { normalizeSubject } from '@/domain/subject';
import { parseMessageIds } from '@/domain/threading';
import type { RemoteMessage } from '@/providers/types';

/** Stable key for a message id header (without angle brackets). */
function messageKey(message: RemoteMessage): string {
  return parseMessageIds(message.messageIdHeader)[0] ?? '';
}

describe('demo data', () => {
  it('builds a Gmail demo account', () => {
    const account = createDemoAccount(1_000);
    expect(account.provider).toBe('gmail');
    expect(account.emailAddress).toBe('demo@wouah-mail.app');
    expect(account.displayName).toBe('Compte démo');
    expect(account.createdAt).toBe(1_000);
  });

  it('includes an inbox folder bound to the account', () => {
    const folders = createDemoFolders('acc_demo');
    expect(folders.some((folder) => folder.role === 'inbox')).toBe(true);
    expect(folders.every((folder) => folder.accountId === 'acc_demo')).toBe(true);
  });

  it('is deterministic across calls', () => {
    expect(createDemoRemoteMessages()).toEqual(createDemoRemoteMessages());
  });

  it('exposes four conversations (one spam) with varied senders', () => {
    const messages = createDemoRemoteMessages();
    expect(messages.length).toBeGreaterThanOrEqual(4);

    const conversations = new Set(messages.map((message) => normalizeSubject(message.subject)));
    expect(conversations.size).toBe(4);

    const domains = new Set(messages.map((message) => message.senderAddress.split('@')[1]));
    expect(domains.size).toBeGreaterThanOrEqual(3);

    expect(messages.some((message) => message.hasAttachments)).toBe(true);
  });

  it('has coherent threading headers within each conversation', () => {
    const messages = createDemoRemoteMessages();
    const byKey = new Map<string, RemoteMessage>();
    for (const message of messages) {
      byKey.set(messageKey(message), message);
    }

    for (const message of messages) {
      const parents = parseMessageIds(
        [message.inReplyTo, message.referencesHeader].filter(Boolean).join(' '),
      );
      for (const parent of parents) {
        const referenced = byKey.get(parent);
        expect(referenced).toBeDefined();
        // The parent must belong to the same conversation.
        expect(normalizeSubject(referenced!.subject)).toBe(normalizeSubject(message.subject));
      }
    }

    // At least one reply must actually use In-Reply-To / References.
    expect(messages.some((message) => message.inReplyTo !== null)).toBe(true);
    expect(messages.some((message) => message.referencesHeader !== null)).toBe(true);
  });

  it('builds a notify rule with a custom sound and a silent domain rule', () => {
    const rules = createDemoRules('acc_demo');
    expect(rules).toHaveLength(2);

    const sender = rules.find((rule) => rule.matchType === 'sender');
    expect(sender?.action).toBe('notify');
    expect(sender?.soundId).toBeTruthy();

    const domain = rules.find((rule) => rule.matchType === 'domain');
    expect(domain?.action).toBe('silent');
    expect(domain?.soundId).toBeNull();
    expect(rules.every((rule) => rule.accountId === 'acc_demo')).toBe(true);
  });

  it('wires the demo provider to the demo account and folders', async () => {
    const { account, folders, messages, provider } = createDemoProvider(2_000);

    expect(provider.id).toBe('gmail');
    expect(provider.emailAddress).toBe(account.emailAddress);
    expect(await provider.listFolders()).toEqual(
      folders.map((folder) => ({
        remoteFolderId: folder.remoteFolderId,
        name: folder.name,
        role: folder.role,
      })),
    );

    const result = await provider.fetchMessages({
      folderRemoteId: 'INBOX',
      knownUidValidity: null,
      lastSyncedUid: null,
    });
    expect(result.uidValidity).toBe(1);
    expect(result.messages.map((m) => m.remoteUid)).toEqual(
      messages.filter((m) => m.folderRemoteId === 'INBOX').map((m) => m.remoteUid),
    );
  });
});
