import type { Message, NotificationRule } from '@/domain/models';
import {
  isWithinQuietHours,
  resolveNotification,
  type ResolveNotificationInput,
} from '@/notifications/resolve';

const NOW = new Date('2026-01-15T12:30:00');

function message(overrides: Partial<Message> = {}): Message {
  return {
    id: 'msg-1',
    accountId: 'acc-1',
    folderId: 'inbox',
    remoteUid: 42,
    messageIdHeader: '<msg-1@example.com>',
    inReplyTo: null,
    referencesHeader: null,
    threadId: 'thread-1',
    senderName: 'Alice Martin',
    senderAddress: 'alice@example.com',
    to: [{ name: 'Moi', address: 'me@example.com' }],
    cc: [],
    subject: 'Réunion demain',
    bodyText: 'Bonjour,\n\nVoici les détails du projet.',
    bodyHtmlSanitized: null,
    receivedAt: NOW.getTime(),
    isRead: false,
    isStarred: false,
    hasAttachments: false,
    syncState: 'synced',
    ...overrides,
  };
}

function rule(overrides: Partial<NotificationRule> = {}): NotificationRule {
  return {
    id: 'rule',
    accountId: null,
    matchType: 'all',
    matchValue: '',
    action: 'notify',
    soundId: null,
    vibrationMode: 'default',
    enabled: true,
    createdAt: 0,
    ...overrides,
  };
}

const DEFAULTS = { soundId: 'default' as string | null, vibrationMode: 'default' as const };

function resolve(
  overrides: Partial<ResolveNotificationInput> = {},
): ReturnType<typeof resolveNotification> {
  return resolveNotification({
    message: message(),
    rules: [],
    defaults: DEFAULTS,
    now: NOW,
    contentMode: 'full',
    ...overrides,
  });
}

describe('isWithinQuietHours', () => {
  it('returns false when disabled (start === end) or absent', () => {
    expect(isWithinQuietHours({ startHour: 22, endHour: 22 }, NOW)).toBe(false);
    expect(isWithinQuietHours(null, NOW)).toBe(false);
    expect(isWithinQuietHours(undefined, NOW)).toBe(false);
  });

  it('handles a daytime range', () => {
    const range = { startHour: 9, endHour: 17 };
    expect(isWithinQuietHours(range, new Date('2026-01-15T08:59:00'))).toBe(false);
    expect(isWithinQuietHours(range, new Date('2026-01-15T09:00:00'))).toBe(true);
    expect(isWithinQuietHours(range, new Date('2026-01-15T16:59:00'))).toBe(true);
    expect(isWithinQuietHours(range, new Date('2026-01-15T17:00:00'))).toBe(false);
  });

  it('handles a range that wraps past midnight', () => {
    const range = { startHour: 22, endHour: 6 };
    expect(isWithinQuietHours(range, new Date('2026-01-15T21:59:00'))).toBe(false);
    expect(isWithinQuietHours(range, new Date('2026-01-15T22:00:00'))).toBe(true);
    expect(isWithinQuietHours(range, new Date('2026-01-15T23:30:00'))).toBe(true);
    expect(isWithinQuietHours(range, new Date('2026-01-15T03:00:00'))).toBe(true);
    expect(isWithinQuietHours(range, new Date('2026-01-15T05:59:00'))).toBe(true);
    expect(isWithinQuietHours(range, new Date('2026-01-15T06:00:00'))).toBe(false);
    expect(isWithinQuietHours(range, new Date('2026-01-15T12:00:00'))).toBe(false);
  });
});

describe('resolveNotification', () => {
  it('notifies with full content by default', () => {
    const decision = resolve();
    expect(decision.notify).toBe(true);
    expect(decision.silent).toBe(false);
    expect(decision.title).toBe('Alice Martin');
    expect(decision.body).toBe('Réunion demain — Bonjour,');
    expect(decision.channelId).toBe('default');
    expect(decision.soundId).toBe('default');
    expect(decision.matchedRuleId).toBeNull();
    expect(decision.reason).toBe('Réglages par défaut');
  });

  it('builds sender-only content', () => {
    const decision = resolve({ contentMode: 'sender' });
    expect(decision.notify).toBe(true);
    expect(decision.title).toBe('Alice Martin');
    expect(decision.body).toBe('Réunion demain');
  });

  it('builds hidden content with a conversation title', () => {
    const decision = resolve({ contentMode: 'hidden', conversationTitle: 'Projet X' });
    expect(decision.title).toBe('Projet X');
    expect(decision.body).toBe('');
  });

  it('falls back to a generic title for hidden content without a conversation title', () => {
    const decision = resolve({ contentMode: 'hidden' });
    expect(decision.title).toBe('Nouveau message');
    expect(decision.body).toBe('');
  });

  it('uses the sound selected by a matching sender rule', () => {
    const decision = resolve({
      rules: [
        rule({
          id: 'soft-rule',
          matchType: 'sender',
          matchValue: 'alice@example.com',
          soundId: 'soft',
          vibrationMode: 'short',
        }),
      ],
    });
    expect(decision.notify).toBe(true);
    expect(decision.soundId).toBe('soft');
    expect(decision.vibrationMode).toBe('short');
    expect(decision.matchedRuleId).toBe('soft-rule');
    expect(decision.channelId).toBe('default');
  });

  it('silences the notification through a matching rule', () => {
    const decision = resolve({
      rules: [
        rule({
          id: 'silent-rule',
          matchType: 'sender',
          matchValue: 'alice@example.com',
          action: 'silent',
          soundId: 'urgent',
          vibrationMode: 'long',
        }),
      ],
    });
    expect(decision.notify).toBe(false);
    expect(decision.silent).toBe(true);
    expect(decision.channelId).toBe('silent');
    expect(decision.soundId).toBeNull();
    expect(decision.vibrationMode).toBe('none');
    // Content is still resolved for logging.
    expect(decision.title).toBe('Alice Martin');
  });

  it('suppresses a normal message during quiet hours', () => {
    const decision = resolve({
      now: new Date('2026-01-15T23:00:00'),
      quietHours: { startHour: 22, endHour: 6 },
    });
    expect(decision.notify).toBe(false);
    expect(decision.silent).toBe(true);
    expect(decision.channelId).toBe('silent');
    expect(decision.reason).toBe('Plage horaire silencieuse');
    expect(decision.title).toBe('Alice Martin');
    expect(decision.body).toBe('Réunion demain — Bonjour,');
  });

  it('lets a VIP notify rule escape quiet hours', () => {
    const decision = resolve({
      isVip: true,
      now: new Date('2026-01-15T23:00:00'),
      quietHours: { startHour: 22, endHour: 6 },
      rules: [
        rule({
          id: 'vip-rule',
          matchType: 'vip',
          matchValue: '',
          action: 'notify',
          soundId: 'urgent',
          vibrationMode: 'long',
        }),
      ],
    });
    expect(decision.notify).toBe(true);
    expect(decision.silent).toBe(false);
    expect(decision.reason).toBe('Règle VIP appliquée');
    expect(decision.matchedRuleId).toBe('vip-rule');
    expect(decision.channelId).toBe('priority');
  });

  it('still suppresses a non-VIP winning rule during quiet hours', () => {
    const decision = resolve({
      now: new Date('2026-01-15T23:00:00'),
      quietHours: { startHour: 22, endHour: 6 },
      rules: [
        rule({
          id: 'sender-rule',
          matchType: 'sender',
          matchValue: 'alice@example.com',
        }),
      ],
    });
    expect(decision.matchedRuleId).toBe('sender-rule');
    expect(decision.notify).toBe(false);
    expect(decision.reason).toBe('Plage horaire silencieuse');
  });

  it('does not suppress outside quiet hours', () => {
    const decision = resolve({
      now: new Date('2026-01-15T12:30:00'),
      quietHours: { startHour: 22, endHour: 6 },
    });
    expect(decision.notify).toBe(true);
    expect(decision.reason).toBe('Réglages par défaut');
  });
});
