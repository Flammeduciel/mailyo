import { StyleSheet, View } from 'react-native';

import type { Message } from '@/domain/models';

import { AppText } from './AppText';
import { FontSize, Radius, Spacing, useAppTheme } from './theme';

export interface MessageBubbleProps {
  message: Message;
  isOwn: boolean;
  showSender?: boolean;
  testID?: string;
}

function pad(value: number): string {
  return value < 10 ? `0${value}` : `${value}`;
}

function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp);
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function MessageBubble({ message, isOwn, showSender = false, testID }: MessageBubbleProps) {
  const colors = useAppTheme();

  return (
    <View
      testID={testID}
      style={[styles.container, isOwn ? styles.containerOwn : styles.containerIncoming]}
    >
      <View
        style={[
          styles.bubble,
          isOwn
            ? {
                backgroundColor: colors.bubbleOutgoing,
                borderTopRightRadius: Radius.sm,
              }
            : {
                backgroundColor: colors.bubbleIncoming,
                borderTopLeftRadius: Radius.sm,
              },
        ]}
      >
        {showSender ? (
          <AppText
            variant="caption"
            weight="semibold"
            style={[
              styles.sender,
              { color: isOwn ? colors.bubbleOutgoingText : colors.bubbleIncomingText },
            ]}
          >
            {message.senderName || message.senderAddress}
          </AppText>
        ) : null}

        <AppText
          variant="body"
          style={[
            styles.body,
            { color: isOwn ? colors.bubbleOutgoingText : colors.bubbleIncomingText },
          ]}
        >
          {message.bodyText}
        </AppText>

        <AppText
          variant="caption"
          style={[
            styles.timestamp,
            { color: isOwn ? colors.bubbleOutgoingText : colors.textMuted },
          ]}
        >
          {formatTimestamp(message.receivedAt)}
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.xs,
  },
  containerOwn: {
    alignItems: 'flex-end',
  },
  containerIncoming: {
    alignItems: 'flex-start',
  },
  bubble: {
    maxWidth: '80%',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.lg,
    gap: Spacing.xs,
  },
  sender: {
    fontSize: FontSize.xs,
  },
  body: {
    flexShrink: 1,
  },
  timestamp: {
    fontSize: FontSize.xs,
    alignSelf: 'flex-end',
  },
});
