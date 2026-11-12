import { MaterialIcons } from '@expo/vector-icons';
import { useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import type { ThreadSummary } from '@/domain/models';

import { AppText } from './AppText';
import { Badge } from './Badge';
import { BottomSheet, type BottomSheetHandle } from './BottomSheet';
import { formatThreadTime, previewText } from './ConversationRow';
import { Spacing, useAppTheme } from './theme';

export interface SubjectsSheetProps {
  visible: boolean;
  /** Who the conversations are with. */
  name: string;
  threads: ThreadSummary[];
  now: number;
  onPick: (thread: ThreadSummary) => void;
  onClose: () => void;
}

/** Unread first, then most recent. */
export function sortSubjects(threads: ThreadSummary[]): ThreadSummary[] {
  return [...threads].sort((a, b) => {
    const unread = Number(b.unreadCount > 0) - Number(a.unreadCount > 0);
    return unread !== 0 ? unread : b.lastMessage.receivedAt - a.lastMessage.receivedAt;
  });
}

/**
 * Several subjects with one person: pick which conversation to open, straight
 * from the list (no intermediate screen). Sized to its content.
 */
export function SubjectsSheet({
  visible,
  name,
  threads,
  now,
  onPick,
  onClose,
}: SubjectsSheetProps) {
  const colors = useAppTheme();
  const sheet = useRef<BottomSheetHandle>(null);
  const unread = threads.filter((thread) => thread.unreadCount > 0).length;
  const subtitle = `${threads.length} conversations${
    unread > 0 ? ` · ${unread} non lue${unread > 1 ? 's' : ''}` : ''
  }`;

  return (
    <BottomSheet
      ref={sheet}
      visible={visible}
      onClose={onClose}
      title={name}
      subtitle={subtitle}
      maxHeight="75%"
      testID="subjects-sheet"
    >
      <ScrollView contentContainerStyle={styles.list}>
        {sortSubjects(threads).map((thread) => {
          const isUnread = thread.unreadCount > 0;
          const subject = thread.lastMessage.subject.trim() || 'Sans objet';
          const preview = previewText(thread.lastMessage.bodyText);
          return (
            <Pressable
              key={thread.id}
              accessibilityRole="button"
              accessibilityLabel={`${subject}${isUnread ? ', non lu' : ''}`}
              onPress={() => sheet.current?.dismiss(() => onPick(thread))}
              testID={`subject-${thread.id}`}
              style={({ pressed }) => [
                styles.row,
                pressed && { backgroundColor: colors.surfaceAlt },
              ]}
            >
              <View
                style={[
                  styles.marker,
                  { backgroundColor: isUnread ? colors.primary : 'transparent' },
                ]}
              />
              <View style={styles.text}>
                <View style={styles.line}>
                  <AppText
                    weight={isUnread ? 'bold' : 'medium'}
                    numberOfLines={1}
                    style={styles.subject}
                  >
                    {subject}
                  </AppText>
                  <AppText
                    variant="caption"
                    weight={isUnread ? 'semibold' : 'regular'}
                    style={{ color: isUnread ? colors.primary : colors.textMuted }}
                  >
                    {formatThreadTime(thread.lastMessage.receivedAt, now)}
                  </AppText>
                </View>
                <View style={styles.line}>
                  {thread.hasAttachments ? (
                    <MaterialIcons
                      name="attach-file"
                      size={14}
                      color={colors.textMuted}
                      style={styles.clip}
                    />
                  ) : null}
                  <AppText
                    variant="caption"
                    color={isUnread ? 'text' : 'textSecondary'}
                    numberOfLines={1}
                    style={styles.preview}
                  >
                    {thread.messageCount > 1 ? `${thread.messageCount} messages · ` : ''}
                    {preview || 'Message sans texte'}
                  </AppText>
                  <Badge count={thread.unreadCount} />
                </View>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  list: {
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.md - 2,
    paddingRight: Spacing.xl,
    paddingLeft: Spacing.md,
  },
  marker: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  text: {
    flex: 1,
    gap: 2,
  },
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  subject: {
    flex: 1,
  },
  preview: {
    flex: 1,
  },
  clip: {
    transform: [{ rotate: '45deg' }],
  },
});
