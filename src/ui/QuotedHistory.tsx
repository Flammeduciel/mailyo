import { MaterialIcons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

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
  /** Jump to the quoted message in the conversation, when it is there. */
  onPress?: () => void;
  /** Part of a flat list: shows its own text only, the list shows the rest. */
  leaf?: boolean;
}

/** Cards nest up to this depth; older messages follow as a flat list. */
const NEST_DEPTH = 2;
/** Safety stop for pathological mails. */
const MAX_CHAIN = 40;

/** The quoted messages below `text`, oldest last, each without its own quotes. */
function quoteChain(text: string): { text: string }[] {
  const chain: { text: string }[] = [];
  let next: string | null = text;
  while (next && chain.length < MAX_CHAIN) {
    chain.push({ text: next });
    next = splitQuotedText(parseQuoteBlock(next).text).quoted;
  }
  return chain;
}

/**
 * Quoted history as cards: « Euloge Ngouma · sam. 6 juin 2026, 16:06 » over
 * the quoted text, without the "> " markers; older quotes nest inside.
 */
export function QuotedHistory({
  text,
  textColor,
  depth = 0,
  onPress,
  leaf = false,
}: QuotedHistoryProps) {
  const colors = useAppTheme();
  const block = parseQuoteBlock(text);
  const inner = splitQuotedText(block.text);
  const own = tidyPlainText(inner.body).trim();
  const flat = depth + 1 >= NEST_DEPTH;
  const quoted = leaf ? null : inner.quoted;

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityHint={onPress ? 'Aller au message cité' : undefined}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: colors.quoteBackground, opacity: pressed ? 0.7 : 1 },
      ]}
    >
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
        {quoted && !flat ? (
          <QuotedHistory text={quoted} textColor={textColor} depth={depth + 1} />
        ) : null}
        {quoted && flat
          ? // Deep history (long back-and-forth): one card per message, no
            // further indentation, so it stays readable on a phone.
            quoteChain(quoted).map((item, index) => (
              <QuotedHistory
                key={index}
                text={item.text}
                textColor={textColor}
                depth={NEST_DEPTH + index}
                leaf
              />
            ))
          : null}
        {onPress ? (
          <View style={styles.goto}>
            <AppText variant="caption" weight="semibold" style={{ color: colors.link }}>
              Voir le message
            </AppText>
            <MaterialIcons name="arrow-upward" size={14} color={colors.link} />
          </View>
        ) : null}
      </View>
    </Pressable>
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
  goto: { flexDirection: 'row', alignItems: 'center', gap: 2, alignSelf: 'flex-end' },
  text: { fontSize: FontSize.sm, lineHeight: 19, opacity: 0.9 },
});
