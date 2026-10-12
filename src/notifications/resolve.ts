/**
 * Resolve a message plus the rule engine decision into a concrete, testable
 * notification. Pure and synchronous: no native module, no clock of its own —
 * the caller injects `now`. The actual presentation lives in `notifier.ts`.
 */

import type { Message, NotificationRule, VibrationMode } from '@/domain/models';
import { evaluateRules } from '@/domain/rules';
import { buildPreview } from '@/domain/sanitize';
import { SILENT_CHANNEL_ID, channelIdForDecision } from '@/notifications/channels';

export type NotificationContentMode = 'full' | 'sender' | 'hidden';

/** A daily quiet window; `start === end` means disabled. May wrap past midnight. */
export interface QuietHours {
  startHour: number;
  endHour: number;
}

export function isWithinQuietHours(quietHours: QuietHours | null | undefined, date: Date): boolean {
  if (!quietHours) {
    return false;
  }
  const { startHour, endHour } = quietHours;
  if (startHour === endHour) {
    return false;
  }
  const hour = date.getHours();
  if (startHour < endHour) {
    return hour >= startHour && hour < endHour;
  }
  // Window wraps past midnight, e.g. 22:00 → 06:00.
  return hour >= startHour || hour < endHour;
}

export interface ResolveNotificationInput {
  message: Message;
  rules: NotificationRule[];
  defaults: { soundId: string | null; vibrationMode: VibrationMode };
  isVip?: boolean;
  quietHours?: QuietHours | null;
  now: Date;
  contentMode: NotificationContentMode;
  conversationTitle?: string;
}

export interface NotificationDecision {
  notify: boolean;
  title: string;
  body: string;
  channelId: string;
  soundId: string | null;
  vibrationMode: VibrationMode;
  reason: string;
  matchedRuleId: string | null;
  silent: boolean;
}

/**
 * True when the winning rule is an explicit VIP notify rule. Such a rule is
 * the only thing allowed to pierce quiet hours.
 */
function isVipNotifyRule(rules: NotificationRule[], matchedRuleId: string | null): boolean {
  if (matchedRuleId === null) {
    return false;
  }
  const rule = rules.find((candidate) => candidate.id === matchedRuleId);
  return rule !== undefined && rule.matchType === 'vip' && rule.action === 'notify';
}

function buildContent(input: ResolveNotificationInput): { title: string; body: string } {
  const { message, contentMode, conversationTitle } = input;
  switch (contentMode) {
    case 'full': {
      const preview = buildPreview(message.bodyText, 80);
      return {
        title: message.senderName,
        body: preview.length > 0 ? `${message.subject} — ${preview}` : message.subject,
      };
    }
    case 'sender':
      return { title: message.senderName, body: message.subject };
    case 'hidden':
      return { title: conversationTitle ?? 'Nouveau message', body: '' };
  }
}

export function resolveNotification(input: ResolveNotificationInput): NotificationDecision {
  const decision = evaluateRules(
    input.rules,
    {
      senderAddress: input.message.senderAddress,
      subject: input.message.subject,
      isVip: input.isVip,
    },
    input.defaults,
  );

  let notify = decision.notify;
  let reason = decision.reason;

  if (
    notify &&
    isWithinQuietHours(input.quietHours, input.now) &&
    !isVipNotifyRule(input.rules, decision.matchedRuleId)
  ) {
    notify = false;
    reason = 'Plage horaire silencieuse';
  }

  const { title, body } = buildContent(input);
  const channelId = notify
    ? channelIdForDecision({
        notify,
        soundId: decision.soundId,
        vibrationMode: decision.vibrationMode,
      })
    : SILENT_CHANNEL_ID;

  return {
    notify,
    title,
    body,
    channelId,
    soundId: decision.soundId,
    vibrationMode: decision.vibrationMode,
    reason,
    matchedRuleId: decision.matchedRuleId,
    silent: !notify,
  };
}
