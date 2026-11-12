import { MaterialIcons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import type { Attachment, EmailAddress, Message } from '@/domain/models';
import { tidyPlainText } from '@/domain/plain-text';
import { splitQuotedText } from '@/domain/quote';

import { AppText } from './AppText';
import { AttachmentList } from './AttachmentList';
import { CopyAvatars } from './CopyAvatars';
import type { PdfPreviewSource } from './PdfThumbnail';
import { HtmlMessageView } from './HtmlMessageView';
import { QuotedHistory } from './QuotedHistory';
import { RichText } from './RichText';
import { FontSize, Radius, Spacing, useAppTheme } from './theme';

/** The message a bubble answers, shown as a quote block on top of it. */
export interface QuotedParent {
  id: string;
  senderName: string;
  snippet: string;
  isOwn: boolean;
}

export interface MessageBubbleProps {
  message: Message;
  isOwn: boolean;
  showSender?: boolean;
  /** Parent message this one replies to. */
  quoted?: QuotedParent | null;
  /** The replied-to message is in the conversation, so the quoted history is redundant. */
  parentInThread?: boolean;
  onQuotePress?: (parentId: string) => void;
  attachments?: Attachment[];
  onOpenAttachment?: (attachment: Attachment) => void;
  resolveAttachment?: (attachmentId: string) => Promise<Attachment>;
  onSaveAttachment?: (attachment: Attachment) => void;
  attachmentProgress?: { id: string; ratio: number | null } | null;
  autoPreviewMaxBytes?: number;
  pdfPreview?: PdfPreviewSource;
  /** People in copy, shown as faces under the bubble; tap opens their contact. */
  onCopyPress?: (people: EmailAddress[]) => void;
  photoOf?: (address: string) => string | undefined;
  /** Hide remote images of HTML mails until the user asks for them. */
  blockRemoteImages?: boolean;
  onPress?: () => void;
  onLongPress?: () => void;
  selected?: boolean;
  /** Briefly highlighted after jumping to it from a quote. */
  highlighted?: boolean;
  testID?: string;
}

function pad(value: number): string {
  return value < 10 ? `0${value}` : `${value}`;
}

function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp);
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * HTML is rendered when it carries real layout (images, tables) or is the only
 * body; otherwise the plain-text part reads better in a chat bubble.
 */
export function shouldRenderHtml(
  message: Pick<Message, 'bodyHtmlSanitized' | 'bodyText'>,
): boolean {
  const html = message.bodyHtmlSanitized;
  if (!html) {
    return false;
  }
  return /<(img|table)\b/i.test(html) || message.bodyText.trim().length === 0;
}

/** First lines of a message's own text, for quote blocks and reply previews. */
export function messageSnippet(message: Pick<Message, 'bodyText' | 'subject'>): string {
  const body = splitQuotedText(message.bodyText).body.replace(/\s+/g, ' ').trim();
  return body || message.subject || '(Message vide)';
}

export function MessageBubble({
  message,
  isOwn,
  showSender = false,
  quoted,
  parentInThread = Boolean(quoted),
  onQuotePress,
  attachments = [],
  onOpenAttachment,
  resolveAttachment,
  onSaveAttachment,
  attachmentProgress,
  autoPreviewMaxBytes,
  pdfPreview,
  blockRemoteImages = false,
  onCopyPress,
  photoOf,
  onPress,
  onLongPress,
  selected = false,
  highlighted = false,
  testID,
}: MessageBubbleProps) {
  const colors = useAppTheme();
  const [showHistory, setShowHistory] = useState(false);
  const html = shouldRenderHtml(message);
  const split = useMemo(() => splitQuotedText(message.bodyText), [message.bodyText]);
  const bodyText = useMemo(() => tidyPlainText(split.body).trim(), [split.body]);
  const textColor = isOwn ? colors.bubbleOutgoingText : colors.bubbleIncomingText;

  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={300}
      style={[
        styles.container,
        html && styles.containerWide,
        isOwn ? styles.containerOwn : styles.containerIncoming,
        (selected || highlighted) && { backgroundColor: colors.primaryContainer + 'AA' },
      ]}
    >
      <View
        style={[
          styles.bubble,
          html && styles.bubbleWide,
          attachments.length > 0 && !html ? styles.bubbleAttachments : null,
          quoted && !html ? styles.bubbleQuoting : null,
          isOwn
            ? { backgroundColor: colors.bubbleOutgoing, borderTopRightRadius: Radius.sm / 2 }
            : { backgroundColor: colors.bubbleIncoming, borderTopLeftRadius: Radius.sm / 2 },
        ]}
      >
        {showSender && !isOwn ? (
          <AppText variant="caption" weight="semibold" style={{ color: colors.primary }}>
            {message.senderName || message.senderAddress}
          </AppText>
        ) : null}

        {quoted ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Message cité de ${quoted.senderName}`}
            onPress={() => onQuotePress?.(quoted.id)}
            style={[styles.quote, { backgroundColor: colors.quoteBackground }]}
            testID={testID ? `${testID}-quote` : undefined}
          >
            <View style={[styles.quoteBar, { backgroundColor: colors.primary }]} />
            <View style={styles.quoteContent}>
              <AppText variant="caption" weight="semibold" style={{ color: colors.primary }}>
                {quoted.isOwn ? 'Vous' : quoted.senderName}
              </AppText>
              <AppText variant="caption" color="textSecondary" numberOfLines={3}>
                {quoted.snippet}
              </AppText>
            </View>
          </Pressable>
        ) : null}

        {html && message.bodyHtmlSanitized ? (
          <HtmlMessageView
            html={message.bodyHtmlSanitized}
            allowHistory={!parentInThread}
            blockImages={blockRemoteImages}
          />
        ) : (
          <>
            {/* A mail that only carries files has no text: no empty line above them. */}
            {bodyText.length > 0 ? (
              <RichText style={{ color: textColor }}>{bodyText}</RichText>
            ) : null}
            {/* The parent is already in the conversation: no need to unfold it again. */}
            {split.quoted && !parentInThread ? (
              <>
                <Pressable onPress={() => setShowHistory((value) => !value)} hitSlop={Spacing.sm}>
                  <AppText variant="caption" weight="semibold" style={{ color: colors.link }}>
                    {showHistory ? 'Masquer l’historique' : '••• Historique'}
                  </AppText>
                </Pressable>
                {showHistory ? <QuotedHistory text={split.quoted} textColor={textColor} /> : null}
              </>
            ) : null}
          </>
        )}

        {attachments.length > 0 ? (
          <AttachmentList
            attachments={attachments}
            onOpen={(attachment) => onOpenAttachment?.(attachment)}
            resolve={resolveAttachment}
            onSave={onSaveAttachment}
            progress={attachmentProgress}
            autoPreviewMaxBytes={autoPreviewMaxBytes}
            pdfPreview={pdfPreview}
            testID={testID ? `${testID}-attachments` : undefined}
          />
        ) : null}

        {message.cc.length > 0 && onCopyPress ? (
          <CopyAvatars
            people={message.cc}
            photoOf={photoOf}
            onPress={onCopyPress}
            textColor={textColor}
            testID={testID ? `${testID}-cc` : undefined}
          />
        ) : null}

        <View style={styles.footer}>
          {message.isStarred ? (
            <MaterialIcons name="star" size={12} color={colors.textMuted} />
          ) : null}
          {message.hasAttachments ? (
            <MaterialIcons name="attach-file" size={12} color={colors.textMuted} />
          ) : null}
          <AppText variant="caption" style={[styles.timestamp, { color: colors.textMuted }]}>
            {formatTimestamp(message.receivedAt)}
          </AppText>
          {isOwn ? (
            <MaterialIcons
              name={message.syncState === 'pending' ? 'schedule' : 'done-all'}
              size={15}
              color={colors.primary}
            />
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    paddingHorizontal: Spacing.md,
    paddingVertical: 2,
  },
  // HTML mails use the whole screen width: no side gutter.
  containerWide: {
    paddingHorizontal: Spacing.xs,
  },
  containerOwn: {
    alignItems: 'flex-end',
  },
  containerIncoming: {
    alignItems: 'flex-start',
  },
  bubble: {
    maxWidth: '82%',
    paddingTop: Spacing.xs + 2,
    paddingBottom: Spacing.xs,
    paddingHorizontal: Spacing.sm + 2,
    borderRadius: Radius.md,
    gap: Spacing.xs,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 1,
  },
  // HTML mails take the whole row, Slack-style, so their layout is never cut.
  bubbleWide: {
    width: '100%',
    maxWidth: '100%',
    paddingHorizontal: Spacing.xs,
  },
  bubbleAttachments: {
    minWidth: '70%',
  },
  // A short reply must not squeeze the quoted message into an unreadable sliver.
  bubbleQuoting: {
    minWidth: '62%',
  },
  quote: {
    flexDirection: 'row',
    borderRadius: Radius.sm,
    overflow: 'hidden',
  },
  quoteBar: {
    width: 4,
  },
  quoteContent: {
    flex: 1,
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.sm,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-end',
    gap: 3,
  },
  timestamp: {
    fontSize: FontSize.xs,
  },
});
