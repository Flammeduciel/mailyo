import { MaterialIcons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import { Dimensions, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
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

import {
  badgeCount,
  MAILBOXES,
  type MailboxCount,
  type MailboxDefinition,
  type MailboxId,
} from '@/domain/mailboxes';

import { AppText } from './AppText';
import { Radius, Spacing, useAppTheme } from './theme';

const WIDTH = Math.min(Dimensions.get('window').width * 0.84, 340);

export interface DrawerLink {
  key: string;
  label: string;
  icon: string;
  onPress: () => void;
  /** Small red dot (e.g. a missing permission). */
  alert?: boolean;
}

export interface MailboxDrawerProps {
  visible: boolean;
  onClose: () => void;
  /** Mailbox currently shown, highlighted. */
  current?: MailboxId | null;
  counts: Partial<Record<MailboxId, MailboxCount>>;
  onOpenMailbox: (id: MailboxId) => void;
  /** Extra entries under the folders (Corbeille, Paramètres…). */
  links?: DrawerLink[];
  /** Line under the wordmark (the account address). */
  subtitle?: string;
}

/**
 * Gmail-style side drawer: inbox categories and folders with unread badges.
 * Slides in from the left; swipe left or tap outside to close.
 */
export function MailboxDrawer({
  visible,
  onClose,
  current,
  counts,
  onOpenMailbox,
  links = [],
  subtitle,
}: MailboxDrawerProps) {
  const colors = useAppTheme();
  const insets = useSafeAreaInsets();
  const [mounted, setMounted] = useState(visible);
  if (visible && !mounted) setMounted(true);
  const translateX = useSharedValue(-WIDTH);

  useEffect(() => {
    if (visible) {
      translateX.set(withTiming(0, { duration: 260, easing: Easing.out(Easing.cubic) }));
    }
  }, [visible, translateX]);

  const finish = useCallback(
    (after?: () => void) => {
      setMounted(false);
      onClose();
      after?.();
    },
    [onClose],
  );

  const close = useCallback(
    (after?: () => void) => {
      translateX.set(
        withTiming(-WIDTH, { duration: 200, easing: Easing.in(Easing.cubic) }, (done) => {
          if (done) scheduleOnRN(finish, after);
        }),
      );
    },
    [finish, translateX],
  );

  useEffect(() => {
    if (!visible && mounted) close();
  }, [visible, mounted, close]);

  const pan = Gesture.Pan()
    .activeOffsetX([-10, 10])
    .onUpdate((event) => {
      translateX.set(Math.min(0, event.translationX));
    })
    .onEnd((event) => {
      if (event.translationX < -WIDTH / 3 || event.velocityX < -700) {
        scheduleOnRN(close);
      } else {
        translateX.set(withSpring(0, { damping: 22, stiffness: 240 }));
      }
    });

  const panelStyle = useAnimatedStyle(() => ({ transform: [{ translateX: translateX.get() }] }));
  const backdropStyle = useAnimatedStyle(() => ({
    opacity: interpolate(translateX.get(), [-WIDTH, 0], [0, 1], 'clamp'),
  }));

  const renderBox = (box: MailboxDefinition) => {
    const active = box.id === current;
    const count = badgeCount(box.id, counts[box.id]);
    return (
      <Pressable
        key={box.id}
        accessibilityRole="button"
        accessibilityState={{ selected: active }}
        accessibilityLabel={count > 0 ? `${box.label}, ${count}` : box.label}
        onPress={() => close(() => onOpenMailbox(box.id))}
        testID={`drawer-${box.id}`}
        style={({ pressed }) => [
          styles.item,
          {
            backgroundColor: active
              ? colors.primaryContainer
              : pressed
                ? colors.surfaceAlt
                : 'transparent',
          },
        ]}
      >
        <MaterialIcons
          name={box.icon as never}
          size={22}
          color={active ? colors.onPrimaryContainer : colors.textSecondary}
        />
        <AppText
          weight={active || count > 0 ? 'semibold' : 'medium'}
          style={[styles.label, { color: active ? colors.onPrimaryContainer : colors.text }]}
          numberOfLines={1}
        >
          {box.label}
        </AppText>
        {count > 0 ? (
          <View
            style={[
              styles.badge,
              { backgroundColor: box.id === 'spam' ? colors.danger : colors.primary },
            ]}
          >
            <AppText weight="bold" style={[styles.badgeText, { color: colors.onPrimary }]}>
              {count > 999 ? '999+' : count}
            </AppText>
          </View>
        ) : null}
      </Pressable>
    );
  };

  return (
    <Modal
      visible={mounted}
      transparent
      statusBarTranslucent
      navigationBarTranslucent
      animationType="none"
      onRequestClose={() => close()}
    >
      <GestureHandlerRootView style={styles.fill}>
        <Animated.View style={[styles.backdrop, { backgroundColor: colors.scrim }, backdropStyle]}>
          <Pressable style={styles.fill} onPress={() => close()} accessibilityLabel="Fermer" />
        </Animated.View>
        <GestureDetector gesture={pan}>
          <Animated.View
            style={[
              styles.panel,
              {
                width: WIDTH,
                backgroundColor: colors.surface,
                paddingTop: insets.top + Spacing.md,
              },
              panelStyle,
            ]}
            testID="mailbox-drawer"
          >
            <View style={styles.head}>
              <AppText weight="bold" style={[styles.brand, { color: colors.brand }]}>
                MailYo
              </AppText>
              {subtitle ? (
                <AppText variant="caption" color="textSecondary" numberOfLines={1}>
                  {subtitle}
                </AppText>
              ) : null}
            </View>
            <ScrollView
              contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + Spacing.lg }]}
            >
              <AppText variant="caption" weight="semibold" color="textMuted" style={styles.section}>
                BOÎTE DE RÉCEPTION
              </AppText>
              {MAILBOXES.filter((box) => box.section === 'inbox').map(renderBox)}
              <View style={[styles.divider, { backgroundColor: colors.separator }]} />
              {MAILBOXES.filter((box) => box.section === 'folders').map(renderBox)}
              {links.length > 0 ? (
                <View style={[styles.divider, { backgroundColor: colors.separator }]} />
              ) : null}
              {links.map((link) => (
                <Pressable
                  key={link.key}
                  accessibilityRole="button"
                  onPress={() => close(link.onPress)}
                  testID={`drawer-${link.key}`}
                  style={({ pressed }) => [
                    styles.item,
                    pressed && { backgroundColor: colors.surfaceAlt },
                  ]}
                >
                  <View>
                    <MaterialIcons
                      name={link.icon as never}
                      size={22}
                      color={colors.textSecondary}
                    />
                    {link.alert ? (
                      <View
                        style={[
                          styles.dot,
                          { backgroundColor: colors.danger, borderColor: colors.surface },
                        ]}
                      />
                    ) : null}
                  </View>
                  <AppText weight="medium" style={styles.label}>
                    {link.label}
                  </AppText>
                </Pressable>
              ))}
            </ScrollView>
          </Animated.View>
        </GestureDetector>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  backdrop: { ...StyleSheet.absoluteFill },
  panel: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    borderTopRightRadius: Radius.lg + 6,
    borderBottomRightRadius: Radius.lg + 6,
    elevation: 16,
    shadowColor: '#0C0E16',
    shadowOffset: { width: 4, height: 0 },
    shadowOpacity: 0.14,
    shadowRadius: 16,
  },
  head: {
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.md,
    gap: 2,
  },
  brand: {
    fontSize: 24,
    lineHeight: 30,
    letterSpacing: -0.5,
  },
  list: {
    paddingHorizontal: Spacing.sm,
  },
  section: {
    letterSpacing: 0.8,
    fontSize: 11,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.xs,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.lg,
    height: 48,
    paddingHorizontal: Spacing.lg,
    borderRadius: Radius.pill,
  },
  label: {
    flex: 1,
  },
  badge: {
    minWidth: 24,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    fontSize: 12,
    lineHeight: 15,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: Spacing.sm,
    marginHorizontal: Spacing.lg,
  },
  dot: {
    position: 'absolute',
    top: -2,
    right: -3,
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
  },
});
