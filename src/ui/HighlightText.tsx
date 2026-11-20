import { Text, type StyleProp, type TextStyle } from 'react-native';

import { highlightSegments } from '@/domain/highlight';

import { useAppTheme } from './theme';

export interface HighlightTextProps {
  text: string;
  query: string;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
}

/** Text with the searched terms highlighted (tinted background, accent colour). */
export function HighlightText({ text, query, style, numberOfLines }: HighlightTextProps) {
  const colors = useAppTheme();
  return (
    <Text style={style} numberOfLines={numberOfLines}>
      {highlightSegments(text, query).map((segment, index) =>
        segment.match ? (
          <Text
            key={index}
            style={{
              backgroundColor: colors.primaryContainer,
              color: colors.onPrimaryContainer,
              fontWeight: '700',
            }}
          >
            {segment.text}
          </Text>
        ) : (
          <Text key={index}>{segment.text}</Text>
        ),
      )}
    </Text>
  );
}
