import { MaterialIcons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { tidyPlainText } from '@/domain/plain-text';
import { parseQuoteBlock, splitQuotedText } from '@/domain/quote';

import { AppText } from './AppText';
import { RichText } from './RichText';
import { FontSize, Radius, Spacing, useAppTheme } from './theme';

export interface QuotedHistoryProps {
  /** Quoted part of a plain-text mail (attribution line + "> " lines). */
  text: string;
  /** Text colour of the bubble it sits in. */
  textColor: string;
  depth?: number;
}

const MAX_DEPTH = 4;

/**
 * Quoted history as cards: « Euloge Ngouma · sam. 6 juin 2026, 16:06 » over
 * the quoted text, without the "> " markers; older quotes nest inside.
 */
export function QuotedHistory({ text, textColor, depth = 0 }: QuotedHistoryProps) {
  const colors = useAppTheme();
  const block = parseQuoteBlock(text);
  const inner =
    depth < MAX_DEPTH ? splitQuotedText(block.text) : { body: block.text, quoted: null };
  const own = tidyPlainText(inner.body).trim();

  return (
    <View style={[styles.card, { backgroundColor: colors.quoteBackground }]}>
      <View
        style={[
          styles.bar,
          { backgroundColor: depth % 2 === 0 ? colors.primary : colors.textMuted },
        ]}
      />
      <View style={styles.content}>
        {block.author || block.date ? (
          <View style={styles.header}>
            <MaterialIcons name="reply" size={14} color={colors.textMuted} />
            {block.author ? (
              <AppText
                variant="caption"
                weight="semibold"
                numberOfLines={1}
                style={[styles.author, { color: colors.primary }]}
              >
                {block.author}
              </AppText>
            ) : null}
            {block.date ? (
              <AppText variant="caption" color="textMuted" numberOfLines={1} style={styles.date}>
                {block.date}
              </AppText>
            ) : null}
          </View>
        ) : null}
        {own ? <RichText style={[styles.text, { color: textColor }]}>{own}</RichText> : null}
        {inner.quoted ? (
          <QuotedHistory text={inner.quoted} textColor={textColor} depth={depth + 1} />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    borderRadius: Radius.sm,
    overflow: 'hidden',
    marginTop: Spacing.xs,
  },
  bar: { width: 3 },
  content: {
    flex: 1,
    gap: 4,
    paddingVertical: Spacing.xs + 2,
    paddingHorizontal: Spacing.sm,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'wrap' },
  author: { flexShrink: 1 },
  date: { flexShrink: 1 },
  text: { fontSize: FontSize.sm, lineHeight: 19, opacity: 0.9 },
});
