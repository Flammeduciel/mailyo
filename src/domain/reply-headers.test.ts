import type { Message } from '@/domain/models';
import { buildReplyHeaders } from '@/domain/reply-headers';

const baseMessage: Message = {
  id: 'm1',
  accountId: 'acc',
  folderId: 'inbox',
  remoteUid: 10,
  messageIdHeader: '<m1@x.com>',
  inReplyTo: null,
  referencesHeader: null,
  threadId: 'acc::msg:root',
  senderName: 'Alice',
  senderAddress: 'alice@x.com',
  to: [
    { name: 'Me', address: 'me@x.com' },
    { name: 'Bob', address: 'bob@x.com' },
  ],
  cc: [{ name: 'Carol', address: 'carol@x.com' }],
  subject: 'Facture',
  bodyText: 'hello',
  bodyHtmlSanitized: null,
  receivedAt: 1,
  isRead: true,
  isStarred: false,
  hasAttachments: false,
  syncState: 'synced',
};

describe('reply headers', () => {
  it('builds a simple reply', () => {
    const headers = buildReplyHeaders(baseMessage, 'me@x.com', 'reply');
    expect(headers.to.map((a) => a.address)).toEqual(['alice@x.com']);
    expect(headers.cc).toEqual([]);
    expect(headers.subject).toBe('Re: Facture');
    expect(headers.inReplyTo).toBe('<m1@x.com>');
    expect(headers.references).toBe('<m1@x.com>');
  });

  it('does not double the Re: prefix', () => {
    const headers = buildReplyHeaders(
      { ...baseMessage, subject: 'Re: Facture' },
      'me@x.com',
      'reply',
    );
    expect(headers.subject).toBe('Re: Facture');
  });

  it('builds reply-all excluding self and the sender', () => {
    const headers = buildReplyHeaders(baseMessage, 'me@x.com', 'replyAll');
    expect(headers.to.map((a) => a.address)).toEqual(['alice@x.com']);
    expect(headers.cc.map((a) => a.address).sort()).toEqual(['bob@x.com', 'carol@x.com']);
  });

  it('chains references through the existing References header', () => {
    const headers = buildReplyHeaders(
      { ...baseMessage, referencesHeader: '<root@x.com>' },
      'me@x.com',
      'reply',
    );
    expect(headers.references).toBe('<root@x.com> <m1@x.com>');
  });

  it('builds a forward without threading headers', () => {
    const headers = buildReplyHeaders(baseMessage, 'me@x.com', 'forward');
    expect(headers.to).toEqual([]);
    expect(headers.subject).toBe('Fwd: Facture');
    expect(headers.inReplyTo).toBeNull();
    expect(headers.references).toBeNull();
  });

  it('handles a message without a message id', () => {
    const headers = buildReplyHeaders(
      { ...baseMessage, messageIdHeader: null },
      'me@x.com',
      'reply',
    );
    expect(headers.inReplyTo).toBeNull();
    expect(headers.references).toBeNull();
  });
});
