import { MaterialIcons } from '@expo/vector-icons';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { AppText } from './AppText';
import { IconButton } from './IconButton';
import { FontSize, Radius, Spacing, useAppTheme } from './theme';

export interface ReplyPreview {
  senderName: string;
  snippet: string;
}

export interface ChatComposerProps {
  value: string;
  onChangeText: (text: string) => void;
  onSend: () => void;
  sending?: boolean;
  replyTo?: ReplyPreview | null;
  onCancelReply?: () => void;
  /** Extra bottom padding (navigation bar inset when the keyboard is hidden). */
  bottomInset?: number;
}

/**
 * Messaging composer: rounded input pill with an optional "replying to"
 * preview above the text, and a round send button beside it.
 */
export function ChatComposer({
  value,
  onChangeText,
  onSend,
  sending = false,
  replyTo,
  onCancelReply,
  bottomInset = 0,
}: ChatComposerProps) {
  const colors = useAppTheme();
  const canSend = value.trim().length > 0 && !sending;

  return (
    <View style={[styles.row, { paddingBottom: Spacing.sm + bottomInset }]}>
      <View style={[styles.pill, { backgroundColor: colors.surface }]}>
        {replyTo ? (
          <View style={[styles.reply, { backgroundColor: colors.quoteBackground }]}>
            <View style={[styles.replyBar, { backgroundColor: colors.primary }]} />
            <View style={styles.replyContent}>
              <AppText variant="caption" weight="semibold" style={{ color: colors.primary }}>
                {replyTo.senderName}
              </AppText>
              <AppText variant="caption" color="textSecondary" numberOfLines={2}>
                {replyTo.snippet}
              </AppText>
            </View>
            <IconButton
              icon="close"
              accessibilityLabel="Annuler la réponse"
              onPress={() => onCancelReply?.()}
              size={18}
              color={colors.textSecondary}
              testID="composer-cancel-reply"
            />
          </View>
        ) : null}
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder="Message"
          placeholderTextColor={colors.textMuted}
          multiline
          style={[styles.input, { color: colors.text }]}
          testID="thread-input"
        />
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Envoyer"
        disabled={!canSend}
        onPress={onSend}
        testID="thread-send"
        style={({ pressed }) => [
          styles.send,
          { backgroundColor: colors.fab, opacity: canSend ? (pressed ? 0.85 : 1) : 0.55 },
        ]}
      >
        {sending ? (
          <ActivityIndicator color={colors.onFab} />
        ) : (
          <MaterialIcons name="send" size={22} color={colors.onFab} />
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.xs + 2,
    paddingHorizontal: Spacing.sm,
    paddingTop: Spacing.xs,
  },
  pill: {
    flex: 1,
    borderRadius: 24,
    paddingHorizontal: Spacing.xs,
    paddingVertical: Spacing.xs,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 1,
  },
  reply: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: Radius.md,
    overflow: 'hidden',
    margin: 2,
  },
  replyBar: {
    width: 4,
    alignSelf: 'stretch',
  },
  replyContent: {
    flex: 1,
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.sm,
  },
  input: {
    minHeight: 40,
    maxHeight: 140,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    fontSize: FontSize.md + 1,
  },
  send: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 2,
  },
});
