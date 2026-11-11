import { Image } from 'expo-image';
import { useState } from 'react';
import { StyleSheet } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

export interface ZoomableImageProps {
  uri: string;
  /** Called with true while zoomed in, so a parent pager can stop swiping. */
  onZoomChange?: (zoomed: boolean) => void;
}

const MAX_SCALE = 5;

/** Pinch to zoom, pan when zoomed, double-tap to toggle 2.5x. */
export function ZoomableImage({ uri, onZoomChange }: ZoomableImageProps) {
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const savedX = useSharedValue(0);
  const savedY = useSharedValue(0);

  const [zoomed, setZoomed] = useState(false);
  const notify = (value: boolean) => {
    setZoomed(value);
    onZoomChange?.(value);
  };

  const reset = () => {
    'worklet';
    scale.value = withTiming(1);
    savedScale.value = 1;
    x.value = withTiming(0);
    y.value = withTiming(0);
    savedX.value = 0;
    savedY.value = 0;
  };

  const pinch = Gesture.Pinch()
    .runOnJS(true)
    .onUpdate((event) => {
      scale.value = Math.min(MAX_SCALE, Math.max(1, savedScale.value * event.scale));
    })
    .onEnd(() => {
      savedScale.value = scale.value;
      if (scale.value <= 1.01) reset();
      notify(scale.value > 1.01);
    });

  const pan = Gesture.Pan()
    .runOnJS(true)
    // Only when zoomed: otherwise horizontal swipes belong to the gallery.
    .enabled(zoomed)
    .onUpdate((event) => {
      if (savedScale.value <= 1) return;
      x.value = savedX.value + event.translationX;
      y.value = savedY.value + event.translationY;
    })
    .onEnd(() => {
      savedX.value = x.value;
      savedY.value = y.value;
    });

  const doubleTap = Gesture.Tap()
    .runOnJS(true)
    .numberOfTaps(2)
    .onEnd(() => {
      if (savedScale.value > 1) {
        reset();
        notify(false);
      } else {
        scale.value = withTiming(2.5);
        savedScale.value = 2.5;
        notify(true);
      }
    });

  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }, { translateY: y.value }, { scale: scale.value }],
  }));

  return (
    <GestureDetector gesture={Gesture.Simultaneous(pinch, pan, doubleTap)}>
      <Animated.View style={[styles.fill, style]}>
        <Image source={{ uri }} style={styles.fill} contentFit="contain" />
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, width: '100%' },
});
