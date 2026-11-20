import { MaterialIcons } from '@expo/vector-icons';
import { useRef, useState } from 'react';
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
  /** Long press selects subjects; deleting hands them over (the caller confirms). */
  onDelete?: (threads: ThreadSummary[]) => void;
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
  onDelete,
}: SubjectsSheetProps) {
  const colors = useAppTheme();
  const sheet = useRef<BottomSheetHandle>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const selecting = selected.size > 0;
  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
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
      {selecting ? (
        <View style={[styles.selectionBar, { backgroundColor: colors.primaryContainer }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Annuler la sélection"
            onPress={() => setSelected(new Set())}
            hitSlop={8}
          >
            <MaterialIcons name="close" size={22} color={colors.onPrimaryContainer} />
          </Pressable>
          <AppText
            weight="semibold"
            style={[styles.selectionText, { color: colors.onPrimaryContainer }]}
          >
            {selected.size} sélectionné{selected.size > 1 ? 's' : ''}
          </AppText>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Supprimer la sélection"
            testID="subjects-delete"
            onPress={() => {
              const chosen = threads.filter((thread) => selected.has(thread.id));
              setSelected(new Set());
              onDelete?.(chosen);
            }}
            style={({ pressed }) => [
              styles.deleteButton,
              { backgroundColor: colors.danger, opacity: pressed ? 0.85 : 1 },
            ]}
          >
            <MaterialIcons name="delete-outline" size={18} color={colors.onPrimary} />
            <AppText variant="caption" weight="semibold" style={{ color: colors.onPrimary }}>
              Supprimer
            </AppText>
          </Pressable>
        </View>
      ) : null}
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
              accessibilityState={{ selected: selected.has(thread.id) }}
              onPress={() =>
                selecting ? toggle(thread.id) : sheet.current?.dismiss(() => onPick(thread))
              }
              onLongPress={onDelete ? () => toggle(thread.id) : undefined}
              delayLongPress={350}
              testID={`subject-${thread.id}`}
              style={({ pressed }) => [
                styles.row,
                selected.has(thread.id)
                  ? { backgroundColor: colors.primaryContainer }
                  : pressed && { backgroundColor: colors.surfaceAlt },
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
  selectionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: 14,
  },
  selectionText: {
    flex: 1,
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.md,
    paddingVertical: 7,
    borderRadius: 999,
  },
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
