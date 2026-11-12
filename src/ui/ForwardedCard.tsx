import { MaterialIcons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { formatFileSize } from '@/domain/attachments';
import { formatForwardDate } from '@/domain/forward';
import type { Attachment, Message } from '@/domain/models';
import { splitQuotedText } from '@/domain/quote';

import { AppText } from './AppText';
import { Avatar } from './Avatar';
import { Radius, Spacing, useAppTheme } from './theme';

export interface ForwardedCardProps {
  message: Message;
  /** Attachments of the original that will be forwarded. */
  attachments: Attachment[];
  onRemoveAttachment: (attachmentId: string) => void;
  photoUri?: string;
}

/** The forwarded message under the editable text: not editable, sent as is. */
export function ForwardedCard({
  message,
  attachments,
  onRemoveAttachment,
  photoUri,
}: ForwardedCardProps) {
  const colors = useAppTheme();
  const name = message.senderName || message.senderAddress;
  const preview = splitQuotedText(message.bodyText).body.trim();

  return (
    <View
      style={[styles.card, { borderColor: colors.border, backgroundColor: colors.surfaceAlt }]}
      testID="forwarded-card"
    >
      <View style={styles.label}>
        <MaterialIcons name="shortcut" size={16} color={colors.primary} />
        <AppText variant="caption" weight="semibold" style={{ color: colors.primary }}>
          Message transféré
        </AppText>
      </View>
      <View style={styles.header}>
        <Avatar name={name} size={36} imageUri={photoUri} />
        <View style={styles.flex}>
          <AppText weight="semibold" numberOfLines={1}>
            {name}
          </AppText>
          <AppText variant="caption" color="textMuted" numberOfLines={1}>
            {formatForwardDate(message.receivedAt)}
          </AppText>
        </View>
      </View>
      <AppText weight="semibold" numberOfLines={2}>
        {message.subject || 'Sans objet'}
      </AppText>
      {preview ? (
        <AppText variant="body" color="textSecondary" numberOfLines={6}>
          {preview}
        </AppText>
      ) : null}
      {attachments.length > 0 ? (
        <View style={styles.files}>
          {attachments.map((attachment) => (
            <View key={attachment.id} style={[styles.file, { backgroundColor: colors.background }]}>
              <MaterialIcons name="attach-file" size={14} color={colors.textSecondary} />
              <AppText variant="caption" numberOfLines={1} style={styles.fileName}>
                {attachment.filename} · {formatFileSize(attachment.sizeBytes)}
              </AppText>
              <Pressable
                onPress={() => onRemoveAttachment(attachment.id)}
                hitSlop={Spacing.sm}
                accessibilityLabel={`Ne pas transférer ${attachment.filename}`}
              >
                <MaterialIcons name="close" size={14} color={colors.textSecondary} />
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.md,
    padding: Spacing.md,
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  label: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  flex: { flex: 1 },
  files: { gap: Spacing.xs },
  file: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    borderRadius: Radius.sm,
  },
  fileName: { flex: 1 },
});
