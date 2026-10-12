/**
 * Notification rule matching.
 *
 * Given the enabled {@link NotificationRule}s and the incoming message context,
 * {@link evaluateRules} picks the most specific match and resolves the final
 * notification decision (notify/silent plus sound and vibration). Pure and
 * synchronous so it is easy to unit test and to run on the sync path.
 */

import { extractDomain, isSameAddress } from '@/domain/mime';
import type { NotificationRule, RuleMatchType, VibrationMode } from '@/domain/models';

export interface RuleContext {
  senderAddress: string;
  subject: string;
  isVip?: boolean;
}

export interface RuleDecision {
  notify: boolean;
  soundId: string | null;
  vibrationMode: VibrationMode;
  specificity: number;
  matchedRuleId: string | null;
  reason: string;
}

/** Higher specificity wins; a sender rule always beats a generic `all` rule. */
const SPECIFICITY: Record<RuleMatchType, number> = {
  sender: 5,
  vip: 4,
  domain: 3,
  subject: 2,
  all: 1,
};

/** French label used to build the human-readable decision reason. */
const MATCH_LABEL: Record<RuleMatchType, string> = {
  sender: 'expéditeur',
  domain: 'domaine',
  subject: 'objet',
  vip: 'VIP',
  all: 'globale',
};

export function ruleSpecificity(matchType: RuleMatchType): number {
  return SPECIFICITY[matchType];
}

/** True when the rule matches the given message context. */
export function matchRule(rule: NotificationRule, ctx: RuleContext): boolean {
  switch (rule.matchType) {
    case 'sender':
      return isSameAddress(ctx.senderAddress, rule.matchValue);
    case 'domain': {
      const expected = rule.matchValue.trim().replace(/^@/, '').toLowerCase();
      return expected.length > 0 && extractDomain(ctx.senderAddress) === expected;
    }
    case 'subject':
      return ctx.subject.toLowerCase().includes(rule.matchValue.trim().toLowerCase());
    case 'vip':
      return ctx.isVip === true;
    case 'all':
      return true;
  }
}

/**
 * Pick the winning rule (highest specificity, then most recently created) and
 * resolve the decision. With no match the defaults apply.
 */
export function evaluateRules(
  rules: NotificationRule[],
  ctx: RuleContext,
  defaults: { soundId: string | null; vibrationMode: VibrationMode },
): RuleDecision {
  let winner: NotificationRule | null = null;
  let specificity = 0;

  for (const rule of rules) {
    if (!rule.enabled || !matchRule(rule, ctx)) {
      continue;
    }
    const candidate = ruleSpecificity(rule.matchType);
    const beatsWinner =
      winner === null ||
      candidate > specificity ||
      (candidate === specificity && rule.createdAt > winner.createdAt);
    if (beatsWinner) {
      winner = rule;
      specificity = candidate;
    }
  }

  if (winner === null) {
    return {
      notify: true,
      soundId: defaults.soundId,
      vibrationMode: defaults.vibrationMode,
      specificity: 0,
      matchedRuleId: null,
      reason: 'Réglages par défaut',
    };
  }

  if (winner.action === 'silent') {
    return {
      notify: false,
      soundId: null,
      vibrationMode: 'none',
      specificity,
      matchedRuleId: winner.id,
      reason: `Silencieux via règle ${MATCH_LABEL[winner.matchType]}`,
    };
  }

  return {
    notify: true,
    soundId: winner.soundId ?? defaults.soundId,
    vibrationMode: winner.vibrationMode,
    specificity,
    matchedRuleId: winner.id,
    reason: `Règle ${MATCH_LABEL[winner.matchType]} appliquée`,
  };
}
