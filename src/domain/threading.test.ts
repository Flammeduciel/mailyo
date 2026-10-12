import {
  computeThreadKey,
  formatMessageId,
  parseMessageIds,
  scopedThreadId,
} from '@/domain/threading';

describe('threading', () => {
  it('parses message ids with and without angle brackets', () => {
    expect(parseMessageIds('<a@x.com> <b@y.com>')).toEqual(['a@x.com', 'b@y.com']);
    expect(parseMessageIds('c@z.com d@w.com')).toEqual(['c@z.com', 'd@w.com']);
    expect(parseMessageIds(null)).toEqual([]);
    expect(parseMessageIds('<a@x.com> <a@x.com>')).toEqual(['a@x.com']);
  });

  it('formats a message id', () => {
    expect(formatMessageId('a@x.com')).toBe('<a@x.com>');
    expect(formatMessageId('<a@x.com>')).toBe('<a@x.com>');
  });

  it('joins an existing conversation through In-Reply-To', () => {
    const known = new Map([['parent@x.com', 'msg:root']]);
    const key = computeThreadKey(
      {
        messageIdHeader: '<child@x.com>',
        inReplyTo: '<parent@x.com>',
        referencesHeader: null,
        subject: 'Re: Hi',
      },
      known,
    );
    expect(key).toBe('msg:root');
  });

  it('joins through References when In-Reply-To is missing', () => {
    const known = new Map([['root@x.com', 'msg:root']]);
    const key = computeThreadKey(
      {
        messageIdHeader: '<child@x.com>',
        inReplyTo: null,
        referencesHeader: '<root@x.com> <mid@x.com>',
        subject: 'Re: Hi',
      },
      known,
    );
    expect(key).toBe('msg:root');
  });

  it('creates a new key from the own message id when nothing is known', () => {
    const key = computeThreadKey({
      messageIdHeader: '<new@x.com>',
      inReplyTo: null,
      referencesHeader: null,
      subject: 'Bonjour',
    });
    expect(key.startsWith('msg:')).toBe(true);
  });

  it('is deterministic for the same root reference', () => {
    const a = computeThreadKey({
      messageIdHeader: '<a@x.com>',
      inReplyTo: null,
      referencesHeader: null,
      subject: 'Bonjour',
    });
    const b = computeThreadKey({
      messageIdHeader: '<b@x.com>',
      inReplyTo: null,
      referencesHeader: null,
      subject: 'Bonjour',
    });
    expect(a).not.toBe(b);
  });

  it('falls back to the normalised subject when no header exists', () => {
    const key = computeThreadKey({
      messageIdHeader: null,
      inReplyTo: null,
      referencesHeader: null,
      subject: 'Re: Facture 2026',
    });
    expect(key.startsWith('sub:')).toBe(true);
    const other = computeThreadKey({
      messageIdHeader: null,
      inReplyTo: null,
      referencesHeader: null,
      subject: 'Fwd: Facture 2026',
    });
    expect(other).toBe(key);
  });

  it('scopes thread ids per account', () => {
    expect(scopedThreadId('acc1', 'msg:root')).toBe('acc1::msg:root');
    expect(scopedThreadId('acc1', 'msg:root')).not.toBe(scopedThreadId('acc2', 'msg:root'));
  });
});
