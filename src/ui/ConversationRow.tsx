import { SymbolView, type AndroidSymbol } from 'expo-symbols';
import { Pressable, StyleSheet, View } from 'react-native';

import type { ThreadSummary } from '@/domain/models';

import { AppText } from './AppText';
import { Avatar } from './Avatar';
import { Badge } from './Badge';
import { FontSize, Radius, Spacing, useAppTheme } from './theme';

export interface ConversationRowProps {
  thread: ThreadSummary;
  onPress?: () => void;
  /** Reference timestamp for the "today" check. Kept explicit to stay pure. */
  now: number;
  testID?: string;
}

function pad(value: number): string {
  return value < 10 ? `0${value}` : `${value}`;
}

/** HH:MM when the message is from today, otherwise DD/MM. */
export function formatThreadTime(timestamp: number, now: number): string {
  const date = new Date(timestamp);
  const reference = new Date(now);
  const sameDay =
    date.getFullYear() === reference.getFullYear() &&
    date.getMonth() === reference.getMonth() &&
    date.getDate() === reference.getDate();

  if (sameDay) {
    return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}`;
}

export function ConversationRow({ thread, onPress, now, testID }: ConversationRowProps) {
  const colors = useAppTheme();
  const isUnread = thread.unreadCount > 0;
  const { lastMessage } = thread;
  const senderName = lastMessage.senderName || lastMessage.senderAddress;

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: pressed ? colors.surfaceAlt : colors.background },
      ]}
    >
      <View style={styles.dotColumn}>
        {isUnread ? <View style={[styles.dot, { backgroundColor: colors.primary }]} /> : null}
      </View>

      <Avatar name={senderName} size={44} />

      <View style={styles.content}>
        <AppText
          variant="body"
          weight={isUnread ? 'bold' : 'medium'}
          numberOfLines={1}
          color="text"
        >
          {senderName}
        </AppText>
        <AppText
          variant="body"
          weight={isUnread ? 'semibold' : 'regular'}
          numberOfLines={1}
          color="text"
        >
          {lastMessage.subject || '(Sans objet)'}
        </AppText>
        <AppText variant="caption" color="textSecondary" numberOfLines={1}>
          {lastMessage.bodyText}
        </AppText>
      </View>

      <View style={styles.meta}>
        <AppText variant="caption" color="textMuted">
          {formatThreadTime(lastMessage.receivedAt, now)}
        </AppText>
        {thread.hasAttachments ? (
          <SymbolView
            name={{
              ios: 'paperclip',
              android: 'attach_file' as AndroidSymbol,
              web: 'attach_file' as AndroidSymbol,
            }}
            size={FontSize.sm}
            tintColor={colors.textMuted}
            fallback={<View style={{ height: FontSize.sm }} />}
          />
        ) : null}
        <Badge count={thread.unreadCount} testID={testID ? `${testID}-badge` : undefined} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    paddingRight: Spacing.lg,
    gap: Spacing.md,
  },
  dotColumn: {
    width: Spacing.md,
    alignItems: 'center',
  },
  dot: {
    width: Spacing.sm,
    height: Spacing.sm,
    borderRadius: Radius.pill,
  },
  content: {
    flex: 1,
    gap: Spacing.xs,
  },
  meta: {
    alignItems: 'flex-end',
    gap: Spacing.xs,
  },
});
