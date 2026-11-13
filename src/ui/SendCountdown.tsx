import { MaterialIcons } from '@expo/vector-icons';
import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedProps,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';

import { AppText } from './AppText';
import { useAppTheme } from './theme';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export interface SendCountdownProps {
  /** Total delay before the mail leaves, in seconds. */
  seconds: number;
  /** Seconds still to go (shown under the stop square). */
  secondsLeft: number;
  onStop: () => void;
  size?: number;
  testID?: string;
}

/**
 * Stands in for the send button while a mail waits to leave: a ring that
 * empties over the delay around a stop button. Tapping it keeps the mail.
 */
export function SendCountdown({
  seconds,
  secondsLeft,
  onStop,
  size = 48,
  testID = 'undo-send',
}: SendCountdownProps) {
  const colors = useAppTheme();
  const stroke = 3;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.set(0);
    progress.set(withTiming(1, { duration: seconds * 1000, easing: Easing.linear }));
  }, [progress, seconds]);

  const ringProps = useAnimatedProps(() => ({
    strokeDashoffset: circumference * progress.get(),
  }));

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Arrêter l’envoi (${secondsLeft} s)`}
      onPress={onStop}
      testID={testID}
      style={({ pressed }) => [
        styles.button,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: colors.primaryContainer,
          transform: [{ scale: pressed ? 0.94 : 1 }],
        },
      ]}
    >
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={colors.primary}
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${circumference} ${circumference}`}
          animatedProps={ringProps}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <View style={styles.center}>
        <MaterialIcons name="stop" size={size * 0.42} color={colors.primary} />
        <AppText weight="bold" style={[styles.seconds, { color: colors.primary }]}>
          {secondsLeft}
        </AppText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  seconds: {
    fontSize: 9,
    lineHeight: 10,
    marginTop: -4,
  },
});
