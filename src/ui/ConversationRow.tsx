import { MaterialIcons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { ThreadSummary } from '@/domain/models';
import { splitQuotedText } from '@/domain/quote';

import { AppText } from './AppText';
import { Avatar } from './Avatar';
import { Badge } from './Badge';
import { FontSize, Radius, Spacing, useAppTheme } from './theme';

export interface ConversationRowProps {
  thread: ThreadSummary;
  onPress?: () => void;
  onLongPress?: () => void;
  /** Reference timestamp for the "today" check. Kept explicit to stay pure. */
  now: number;
  /** The last message was sent by the user (shows a "sent" tick). */
  isOwnLast?: boolean;
  /** Multi-selection mode highlight. */
  selected?: boolean;
  /** Sender's profile photo; initials are shown without one. */
  photoUri?: string;
  /** Several conversations (subjects) with this person are grouped in the row. */
  subjectCount?: number;
  testID?: string;
}

function pad(value: number): string {
  return value < 10 ? `0${value}` : `${value}`;
}

const WEEKDAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const MONTHS = [
  'janv.',
  'févr.',
  'mars',
  'avr.',
  'mai',
  'juin',
  'juil.',
  'août',
  'sept.',
  'oct.',
  'nov.',
  'déc.',
];

function startOfDay(timestamp: number): number {
  const date = new Date(timestamp);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** HH:MM today, "Hier", the weekday within a week, "12 janv." this year, else DD/MM/YYYY. */
export function formatThreadTime(timestamp: number, now: number): string {
  const date = new Date(timestamp);
  const days = Math.round((startOfDay(now) - startOfDay(timestamp)) / 86_400_000);
  if (days <= 0) {
    return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }
  if (days === 1) {
    return 'Hier';
  }
  if (days < 7) {
    return WEEKDAYS[date.getDay()];
  }
  if (date.getFullYear() === new Date(now).getFullYear()) {
    return `${date.getDate()} ${MONTHS[date.getMonth()]}`;
  }
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
}

/** One-line preview: the new text of the last message, quoted history removed. */
export function previewText(bodyText: string): string {
  return splitQuotedText(bodyText).body.replace(/\s+/g, ' ').trim();
}

export function ConversationRow({
  thread,
  onPress,
  onLongPress,
  now,
  isOwnLast = false,
  selected = false,
  photoUri,
  subjectCount = 1,
  testID,
}: ConversationRowProps) {
  const colors = useAppTheme();
  const isUnread = thread.unreadCount > 0;
  const { lastMessage } = thread;
  const senderName = thread.contact.name || thread.contact.address;
  const preview = previewText(lastMessage.bodyText);
  const subjectText = lastMessage.subject.trim();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={350}
      testID={testID}
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: selected
            ? colors.primaryContainer
            : pressed
              ? colors.surfaceAlt
              : colors.background,
        },
      ]}
    >
      <View>
        <Avatar name={senderName} size={50} imageUri={photoUri} />
        {selected ? (
          <View
            style={[
              styles.check,
              { backgroundColor: colors.primary, borderColor: colors.background },
            ]}
          >
            <MaterialIcons name="check" size={14} color={colors.onPrimary} />
          </View>
        ) : null}
        {/* Several subjects with this person: a tiny count under the face. */}
        {subjectCount > 1 ? (
          <AppText
            variant="caption"
            weight="semibold"
            style={[styles.subjectCount, { color: colors.primary }]}
            testID={testID ? `${testID}-subjects` : undefined}
          >
            {subjectCount} sujets
          </AppText>
        ) : null}
      </View>

      <View style={styles.content}>
        <View style={styles.line}>
          <AppText weight={isUnread ? 'bold' : 'medium'} numberOfLines={1} style={styles.name}>
            {senderName}
          </AppText>
          {thread.isSpam ? (
            <View style={[styles.subjects, { backgroundColor: colors.dangerContainer }]}>
              <AppText
                variant="caption"
                weight="semibold"
                style={[styles.spam, { color: colors.danger }]}
              >
                Spam
              </AppText>
            </View>
          ) : null}
          <AppText
            variant="caption"
            weight={isUnread ? 'semibold' : 'regular'}
            style={{ color: isUnread ? colors.primary : colors.textMuted }}
          >
            {formatThreadTime(lastMessage.receivedAt, now)}
          </AppText>
        </View>

        <View style={styles.line}>
          {isOwnLast ? <MaterialIcons name="done-all" size={16} color={colors.primary} /> : null}
          {thread.hasAttachments ? (
            <MaterialIcons
              name="attach-file"
              size={15}
              color={colors.textMuted}
              style={styles.clip}
            />
          ) : null}
          <Text
            numberOfLines={1}
            style={[styles.preview, { color: isUnread ? colors.text : colors.textSecondary }]}
          >
            {subjectText ? (
              <Text style={isUnread ? styles.subjectUnread : styles.subject}>{subjectText}</Text>
            ) : null}
            {subjectText && preview ? ' · ' : ''}
            {preview}
            {!subjectText && !preview ? (
              <Text style={[styles.placeholder, { color: colors.textMuted }]}>
                {thread.hasAttachments ? 'Pièce jointe' : 'Message sans texte'}
              </Text>
            ) : null}
          </Text>
          <View style={styles.icons}>
            {thread.isPinned ? (
              <MaterialIcons name="push-pin" size={16} color={colors.textMuted} />
            ) : null}
            {thread.isStarred ? (
              <MaterialIcons name="star" size={16} color={colors.textMuted} />
            ) : null}
            <Badge count={thread.unreadCount} testID={testID ? `${testID}-badge` : undefined} />
          </View>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.md - 1,
    paddingHorizontal: Spacing.lg,
    gap: Spacing.md + 2,
  },
  check: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
    gap: 2,
  },
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  name: {
    flex: 1,
    fontSize: FontSize.md + 1,
    letterSpacing: -0.1,
  },
  spam: {
    fontSize: 11,
    lineHeight: 15,
    letterSpacing: 0.2,
  },
  preview: {
    flex: 1,
    fontSize: FontSize.md - 1,
    lineHeight: 20,
  },
  subjectCount: {
    fontSize: 10,
    lineHeight: 12,
    textAlign: 'center',
    marginTop: 3,
  },
  clip: {
    transform: [{ rotate: '45deg' }],
  },
  subjects: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 1,
    borderRadius: Radius.pill,
  },
  subject: {
    fontWeight: '500',
  },
  placeholder: {
    fontStyle: 'italic',
  },
  subjectUnread: {
    fontWeight: '700',
  },
  icons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
});
