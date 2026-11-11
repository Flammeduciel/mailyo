import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { Radius, Spacing, useAppTheme } from './theme';

const BUBBLES: { own: boolean; width: `${number}%`; height: number }[] = [
  { own: false, width: '72%', height: 64 },
  { own: true, width: '55%', height: 44 },
  { own: false, width: '92%', height: 160 },
  { own: true, width: '40%', height: 36 },
  { own: false, width: '64%', height: 52 },
];

/** Placeholder bubbles that pulse while a conversation loads. */
export function ThreadSkeleton() {
  const colors = useAppTheme();
  const opacity = useSharedValue(0.45);

  useEffect(() => {
    opacity.value = withRepeat(withTiming(0.9, { duration: 750 }), -1, true);
  }, [opacity]);

  const pulse = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View style={[styles.container, pulse]} testID="thread-loading">
      {BUBBLES.map((bubble, index) => (
        <View
          key={index}
          style={[
            styles.bubble,
            {
              alignSelf: bubble.own ? 'flex-end' : 'flex-start',
              width: bubble.width,
              height: bubble.height,
              backgroundColor: bubble.own ? colors.bubbleOutgoing : colors.bubbleIncoming,
            },
          ]}
        />
      ))}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    padding: Spacing.md,
    gap: Spacing.sm,
    justifyContent: 'flex-end',
    flex: 1,
  },
  bubble: {
    borderRadius: Radius.md,
  },
});
