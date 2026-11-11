import { StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { AppText } from './AppText';
import { useAppTheme } from './theme';

export interface SyncRingProps {
  /** 0..1 */
  ratio: number;
  size?: number;
  strokeWidth?: number;
  /** Show the percentage in the middle. */
  showLabel?: boolean;
  testID?: string;
}

/** Circle that fills up as the sync progresses. */
export function SyncRing({
  ratio,
  size = 44,
  strokeWidth = 4,
  showLabel = true,
  testID,
}: SyncRingProps) {
  const colors = useAppTheme();
  const clamped = Math.max(0, Math.min(1, ratio));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  return (
    <View
      style={{ width: size, height: size }}
      testID={testID}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped * 100) }}
    >
      <Svg width={size} height={size}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={colors.primaryContainer}
          strokeWidth={strokeWidth}
          fill="none"
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={colors.primary}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={circumference * (1 - clamped)}
          // Start at 12 o'clock.
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      {showLabel ? (
        <View style={styles.label} pointerEvents="none">
          <AppText variant="caption" weight="semibold" style={{ fontSize: size / 4 }}>
            {Math.round(clamped * 100)}
          </AppText>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
