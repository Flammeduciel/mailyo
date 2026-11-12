import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useState,
  type ReactNode,
  type Ref,
} from 'react';
import { Dimensions, Modal, Pressable, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { AppText } from './AppText';
import { Radius, Spacing, useAppTheme } from './theme';

const SCREEN_HEIGHT = Dimensions.get('window').height;
const DISMISS_DISTANCE = 110;
const DISMISS_VELOCITY = 900;

export interface BottomSheetHandle {
  /** Animate out, then run `after` (and `onClose`). */
  dismiss: (after?: () => void) => void;
}

export interface BottomSheetProps {
  visible: boolean;
  /** Called once the sheet has left the screen (backdrop, drag, back button). */
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children: ReactNode;
  /** Max height as a share of the screen. */
  maxHeight?: `${number}%`;
  testID?: string;
  ref?: Ref<BottomSheetHandle>;
}

/**
 * MailYo bottom sheet: slides up over a backdrop that fades with it, follows
 * the finger on the grab handle (drag down, flick or tap outside to close).
 */
export function BottomSheet({
  visible,
  onClose,
  title,
  subtitle,
  children,
  maxHeight = '88%',
  testID,
  ref,
}: BottomSheetProps) {
  const colors = useAppTheme();
  const insets = useSafeAreaInsets();
  const [mounted, setMounted] = useState(visible);
  if (visible && !mounted) {
    setMounted(true);
  }
  const translateY = useSharedValue(SCREEN_HEIGHT);
  const sheetHeight = useSharedValue(SCREEN_HEIGHT);

  useEffect(() => {
    if (visible) {
      translateY.set(withTiming(0, { duration: 300, easing: Easing.out(Easing.cubic) }));
    }
  }, [visible, translateY]);

  const finish = useCallback(
    (after?: () => void) => {
      setMounted(false);
      onClose();
      after?.();
    },
    [onClose],
  );

  const dismiss = useCallback(
    (after?: () => void) => {
      translateY.set(
        withTiming(
          sheetHeight.get(),
          { duration: 220, easing: Easing.in(Easing.cubic) },
          (finished) => {
            if (finished) scheduleOnRN(finish, after);
          },
        ),
      );
    },
    [finish, sheetHeight, translateY],
  );

  useImperativeHandle(ref, () => ({ dismiss }), [dismiss]);

  // Parent hid it without going through dismiss (e.g. state reset): animate out too.
  useEffect(() => {
    if (!visible && mounted) dismiss();
  }, [visible, mounted, dismiss]);

  const pan = Gesture.Pan()
    .activeOffsetY([-8, 8])
    .onUpdate((event) => {
      translateY.set(event.translationY > 0 ? event.translationY : event.translationY / 6);
    })
    .onEnd((event) => {
      if (event.translationY > DISMISS_DISTANCE || event.velocityY > DISMISS_VELOCITY) {
        scheduleOnRN(dismiss);
      } else {
        translateY.set(withSpring(0, { damping: 22, stiffness: 240 }));
      }
    });

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.get() }],
  }));
  const backdropStyle = useAnimatedStyle(() => ({
    opacity: interpolate(translateY.get(), [0, sheetHeight.get()], [1, 0], 'clamp'),
  }));

  return (
    <Modal
      visible={mounted}
      transparent
      statusBarTranslucent
      navigationBarTranslucent
      animationType="none"
      onRequestClose={() => dismiss()}
    >
      <GestureHandlerRootView style={styles.fill}>
        <Animated.View style={[styles.backdrop, { backgroundColor: colors.scrim }, backdropStyle]}>
          <Pressable style={styles.fill} onPress={() => dismiss()} accessibilityLabel="Fermer" />
        </Animated.View>

        <Animated.View
          onLayout={(event) => {
            sheetHeight.set(event.nativeEvent.layout.height);
          }}
          style={[
            styles.sheet,
            {
              maxHeight,
              backgroundColor: colors.surface,
              paddingBottom: insets.bottom + Spacing.md,
            },
            sheetStyle,
          ]}
          testID={testID}
        >
          {/* The whole header is the grab zone, so content can scroll freely below. */}
          <GestureDetector gesture={pan}>
            <View style={styles.grab}>
              <View style={[styles.handle, { backgroundColor: colors.border }]} />
              {title ? (
                <View style={styles.header}>
                  <AppText weight="semibold" style={styles.title}>
                    {title}
                  </AppText>
                  {subtitle ? (
                    <AppText variant="caption" color="textSecondary" style={styles.subtitle}>
                      {subtitle}
                    </AppText>
                  ) : null}
                </View>
              ) : null}
            </View>
          </GestureDetector>
          {children}
        </Animated.View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: Radius.lg + 6,
    borderTopRightRadius: Radius.lg + 6,
    elevation: 16,
    shadowColor: '#0C0E16',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
  },
  grab: {
    paddingTop: Spacing.sm + 2,
    paddingBottom: Spacing.sm,
  },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
  },
  header: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.md,
    gap: 4,
  },
  title: {
    fontSize: 18,
    lineHeight: 24,
    letterSpacing: -0.2,
  },
  subtitle: {
    lineHeight: 19,
  },
});
