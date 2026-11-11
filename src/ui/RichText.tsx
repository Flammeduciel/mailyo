import { useMemo } from 'react';
import { StyleSheet, Text, type StyleProp, type TextStyle } from 'react-native';

import { linkify } from '@/domain/linkify';
import { splitEmphasis } from '@/domain/plain-text';

import { openLink } from './open-link';
import { FontSize, useAppTheme } from './theme';

export interface RichTextProps {
  children: string;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
  testID?: string;
}

/** Plain email text with URLs and addresses rendered as tappable links. */
export function RichText({ children, style, numberOfLines, testID }: RichTextProps) {
  const colors = useAppTheme();
  const parts = useMemo(
    () =>
      splitEmphasis(children).map((part) => ({ bold: part.bold, segments: linkify(part.text) })),
    [children],
  );

  return (
    <Text
      selectable
      numberOfLines={numberOfLines}
      testID={testID}
      style={[styles.text, { color: colors.text }, style]}
    >
      {parts.map((part, partIndex) => (
        <Text key={partIndex} style={part.bold ? styles.bold : undefined}>
          {part.segments.map((segment, index) =>
            segment.type === 'text' ? (
              segment.text
            ) : (
              <Text
                key={index}
                accessibilityRole="link"
                onPress={() => void openLink(segment.href)}
                style={[styles.link, { color: colors.link }]}
              >
                {segment.text}
              </Text>
            ),
          )}
        </Text>
      ))}
    </Text>
  );
}

const styles = StyleSheet.create({
  text: {
    fontSize: FontSize.md + 1,
    lineHeight: 22,
  },
  link: {
    textDecorationLine: 'underline',
  },
  bold: {
    fontWeight: '700',
  },
});
