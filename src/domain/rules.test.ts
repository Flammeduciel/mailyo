import type { NotificationRule } from '@/domain/models';
import { evaluateRules, matchRule, ruleSpecificity, type RuleContext } from '@/domain/rules';

const DEFAULTS = { soundId: 'default-sound', vibrationMode: 'default' as const };

function rule(overrides: Partial<NotificationRule>): NotificationRule {
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

const ctx: RuleContext = { senderAddress: 'Alice@Example.com', subject: 'Bonjour le monde' };

describe('rules', () => {
  it('exposes the documented specificity scale', () => {
    expect(ruleSpecificity('sender')).toBe(5);
    expect(ruleSpecificity('vip')).toBe(4);
    expect(ruleSpecificity('domain')).toBe(3);
    expect(ruleSpecificity('subject')).toBe(2);
    expect(ruleSpecificity('all')).toBe(1);
  });

  it('prefers sender over domain, subject and all', () => {
    const decision = evaluateRules(
      [
        rule({ id: 'all', matchType: 'all' }),
        rule({ id: 'subject', matchType: 'subject', matchValue: 'bonjour' }),
        rule({ id: 'domain', matchType: 'domain', matchValue: 'example.com' }),
        rule({ id: 'sender', matchType: 'sender', matchValue: 'alice@example.com' }),
      ],
      ctx,
      DEFAULTS,
    );
    expect(decision.matchedRuleId).toBe('sender');
    expect(decision.specificity).toBe(5);
    expect(decision.reason).toBe('Règle expéditeur appliquée');
  });

  it('prefers domain over subject and all when no sender matches', () => {
    const decision = evaluateRules(
      [
        rule({ id: 'all', matchType: 'all' }),
        rule({ id: 'subject', matchType: 'subject', matchValue: 'bonjour' }),
        rule({ id: 'domain', matchType: 'domain', matchValue: 'example.com' }),
      ],
      ctx,
      DEFAULTS,
    );
    expect(decision.matchedRuleId).toBe('domain');
    expect(decision.specificity).toBe(3);
  });

  it('prefers subject over all when nothing more specific matches', () => {
    const decision = evaluateRules(
      [
        rule({ id: 'all', matchType: 'all' }),
        rule({ id: 'subject', matchType: 'subject', matchValue: 'bonjour' }),
      ],
      ctx,
      DEFAULTS,
    );
    expect(decision.matchedRuleId).toBe('subject');
    expect(decision.specificity).toBe(2);
  });

  it('silences the notification through a matching rule', () => {
    const decision = evaluateRules(
      [
        rule({
          id: 'silent',
          matchType: 'sender',
          matchValue: 'alice@example.com',
          action: 'silent',
          soundId: 'loud',
          vibrationMode: 'long',
        }),
      ],
      ctx,
      DEFAULTS,
    );
    expect(decision.notify).toBe(false);
    expect(decision.soundId).toBeNull();
    expect(decision.vibrationMode).toBe('none');
    expect(decision.matchedRuleId).toBe('silent');
    expect(decision.reason).toBe('Silencieux via règle expéditeur');
  });

  it('ignores disabled rules', () => {
    const decision = evaluateRules(
      [
        rule({
          id: 'off',
          matchType: 'sender',
          matchValue: 'alice@example.com',
          action: 'silent',
          enabled: false,
        }),
      ],
      ctx,
      DEFAULTS,
    );
    expect(decision.matchedRuleId).toBeNull();
    expect(decision.notify).toBe(true);
    expect(decision.reason).toBe('Réglages par défaut');
  });

  it('matches vip rules only for vip senders', () => {
    const vipRule = rule({ id: 'vip', matchType: 'vip', matchValue: '' });
    expect(matchRule(vipRule, { ...ctx, isVip: true })).toBe(true);
    expect(matchRule(vipRule, { ...ctx, isVip: false })).toBe(false);
    expect(matchRule(vipRule, ctx)).toBe(false);

    const decision = evaluateRules([vipRule], { ...ctx, isVip: true }, DEFAULTS);
    expect(decision.matchedRuleId).toBe('vip');
    expect(decision.specificity).toBe(4);
  });

  it('matches subject as a case-insensitive substring', () => {
    expect(matchRule(rule({ matchType: 'subject', matchValue: 'MONDE' }), ctx)).toBe(true);
    expect(matchRule(rule({ matchType: 'subject', matchValue: 'le mo' }), ctx)).toBe(true);
    expect(matchRule(rule({ matchType: 'subject', matchValue: 'absent' }), ctx)).toBe(false);
  });

  it('matches sender case-insensitively', () => {
    expect(matchRule(rule({ matchType: 'sender', matchValue: 'ALICE@example.COM' }), ctx)).toBe(
      true,
    );
    expect(matchRule(rule({ matchType: 'sender', matchValue: 'bob@example.com' }), ctx)).toBe(
      false,
    );
  });

  it('accepts a domain written with or without a leading @', () => {
    expect(matchRule(rule({ matchType: 'domain', matchValue: '@example.com' }), ctx)).toBe(true);
    expect(matchRule(rule({ matchType: 'domain', matchValue: 'example.com' }), ctx)).toBe(true);
    expect(matchRule(rule({ matchType: 'domain', matchValue: '@other.com' }), ctx)).toBe(false);
  });

  it('returns the defaults when nothing matches', () => {
    const decision = evaluateRules([], ctx, DEFAULTS);
    expect(decision).toEqual({
      notify: true,
      soundId: 'default-sound',
      vibrationMode: 'default',
      specificity: 0,
      matchedRuleId: null,
      reason: 'Réglages par défaut',
    });
  });

  it('falls back to the default sound when a notify rule defines none', () => {
    const decision = evaluateRules(
      [rule({ id: 'quiet', matchType: 'sender', matchValue: 'alice@example.com', soundId: null })],
      ctx,
      DEFAULTS,
    );
    expect(decision.notify).toBe(true);
    expect(decision.soundId).toBe('default-sound');
    expect(decision.vibrationMode).toBe('default');
  });

  it('uses the rule sound and vibration when defined', () => {
    const decision = evaluateRules(
      [
        rule({
          id: 'custom',
          matchType: 'sender',
          matchValue: 'alice@example.com',
          soundId: 'chime',
          vibrationMode: 'short',
        }),
      ],
      ctx,
      DEFAULTS,
    );
    expect(decision.soundId).toBe('chime');
    expect(decision.vibrationMode).toBe('short');
  });

  it('breaks a specificity tie with the most recently created rule', () => {
    const decision = evaluateRules(
      [
        rule({
          id: 'older',
          matchType: 'sender',
          matchValue: 'alice@example.com',
          action: 'silent',
          createdAt: 1,
        }),
        rule({
          id: 'newer',
          matchType: 'sender',
          matchValue: 'alice@example.com',
          createdAt: 2,
        }),
      ],
      ctx,
      DEFAULTS,
    );
    expect(decision.matchedRuleId).toBe('newer');
    expect(decision.notify).toBe(true);
    expect(decision.specificity).toBe(5);
  });
});
