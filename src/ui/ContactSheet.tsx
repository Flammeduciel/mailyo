import { MaterialIcons } from '@expo/vector-icons';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
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

import { AppText } from './AppText';
import { Avatar } from './Avatar';
import { Radius, Spacing, useAppTheme } from './theme';

const SCREEN_HEIGHT = Dimensions.get('window').height;
const DISMISS_DISTANCE = 120;
const DISMISS_VELOCITY = 900;

export interface ContactSheetDetails {
  phones: string[];
  organization: string | null;
  jobTitle: string | null;
  addresses: string[];
  birthday: string | null;
  saved: boolean;
}

export interface ContactSheetStats {
  received: number;
  sent: number;
  firstAt: number | null;
  lastAt: number | null;
}

export interface ContactSheetProps {
  visible: boolean;
  onClose: () => void;
  name: string;
  address: string;
  photoUri?: string;
  details?: ContactSheetDetails;
  stats?: ContactSheetStats;
  onCompose: () => void;
  onCopyAddress: () => void;
  onCall: (phone: string) => void;
}

function formatDate(timestamp: number | null): string {
  if (timestamp === null) {
    return 'Inconnue';
  }
  return new Date(timestamp).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/**
 * Contact card as a draggable bottom sheet: grab handle, drag down or tap the
 * dimmed backdrop to dismiss.
 */
export function ContactSheet({
  visible,
  onClose,
  name,
  address,
  photoUri,
  details,
  stats,
  onCompose,
  onCopyAddress,
  onCall,
}: ContactSheetProps) {
  const colors = useAppTheme();
  const insets = useSafeAreaInsets();
  const [mounted, setMounted] = useState(visible);
  // Mount as soon as it is asked to show; unmounting waits for the exit animation.
  if (visible && !mounted) {
    setMounted(true);
  }
  const translateY = useSharedValue(SCREEN_HEIGHT);
  const sheetHeight = useSharedValue(SCREEN_HEIGHT);

  useEffect(() => {
    if (visible) {
      translateY.set(withTiming(0, { duration: 280, easing: Easing.out(Easing.cubic) }));
    }
  }, [visible, translateY]);

  const close = useCallback(() => {
    translateY.set(
      withTiming(
        sheetHeight.get(),
        { duration: 220, easing: Easing.in(Easing.cubic) },
        (finished) => {
          if (finished) {
            scheduleOnRN(setMounted, false);
            scheduleOnRN(onClose);
          }
        },
      ),
    );
  }, [onClose, sheetHeight, translateY]);

  const pan = Gesture.Pan()
    .activeOffsetY([-8, 8])
    .onUpdate((event) => {
      // Resist dragging upwards, follow the finger downwards.
      translateY.set(event.translationY > 0 ? event.translationY : event.translationY / 6);
    })
    .onEnd((event) => {
      if (event.translationY > DISMISS_DISTANCE || event.velocityY > DISMISS_VELOCITY) {
        scheduleOnRN(close);
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

  const phones = details?.phones ?? [];
  const organization = [details?.jobTitle, details?.organization].filter(Boolean).join(' · ');

  return (
    <Modal
      visible={mounted}
      transparent
      statusBarTranslucent
      navigationBarTranslucent
      animationType="none"
      onRequestClose={close}
    >
      <GestureHandlerRootView style={styles.fill}>
        <Animated.View style={[styles.backdrop, backdropStyle]}>
          <Pressable style={styles.fill} onPress={close} accessibilityLabel="Fermer" />
        </Animated.View>

        <GestureDetector gesture={pan}>
          <Animated.View
            onLayout={(event) => {
              sheetHeight.set(event.nativeEvent.layout.height);
            }}
            style={[
              styles.sheet,
              { backgroundColor: colors.surface, paddingBottom: insets.bottom + Spacing.lg },
              sheetStyle,
            ]}
            testID="contact-sheet"
          >
            <View style={styles.handleArea}>
              <View style={[styles.handle, { backgroundColor: colors.border }]} />
            </View>

            <ScrollView bounces={false} contentContainerStyle={styles.content}>
              <View style={styles.hero}>
                <Avatar name={name} size={84} imageUri={photoUri} />
                <AppText variant="title" weight="bold" style={styles.center}>
                  {name}
                </AppText>
                {name !== address ? (
                  <AppText color="textSecondary" style={styles.center}>
                    {address}
                  </AppText>
                ) : null}
                {organization ? (
                  <AppText variant="caption" color="textMuted" style={styles.center}>
                    {organization}
                  </AppText>
                ) : null}
              </View>

              <View style={styles.actions}>
                <SheetAction icon="edit" label="Écrire" onPress={onCompose} />
                <SheetAction icon="content-copy" label="Copier" onPress={onCopyAddress} />
                {phones[0] ? (
                  <SheetAction icon="call" label="Appeler" onPress={() => onCall(phones[0])} />
                ) : null}
              </View>

              <View style={[styles.card, { backgroundColor: colors.surfaceAlt }]}>
                <DetailRow icon="mail-outline" label="E-mail" value={address} />
                {phones.map((phone) => (
                  <DetailRow
                    key={phone}
                    icon="phone"
                    label="Téléphone"
                    value={phone}
                    onPress={() => onCall(phone)}
                  />
                ))}
                {details?.addresses.map((value) => (
                  <DetailRow key={value} icon="place" label="Adresse" value={value} />
                ))}
                {details?.birthday ? (
                  <DetailRow icon="cake" label="Anniversaire" value={details.birthday} />
                ) : null}
                <DetailRow
                  icon={details?.saved ? 'contacts' : 'person-outline'}
                  label="Google"
                  value={
                    details?.saved
                      ? 'Dans tes contacts'
                      : details
                        ? 'Contact fréquent (non enregistré)'
                        : 'Inconnu de tes contacts Google'
                  }
                />
              </View>

              {stats ? (
                <View style={[styles.card, { backgroundColor: colors.surfaceAlt }]}>
                  <DetailRow
                    icon="forum"
                    label="Échanges"
                    value={`${stats.received} reçu${stats.received > 1 ? 's' : ''} · ${stats.sent} envoyé${stats.sent > 1 ? 's' : ''}`}
                  />
                  <DetailRow
                    icon="history"
                    label="Premier échange"
                    value={formatDate(stats.firstAt)}
                  />
                  <DetailRow
                    icon="schedule"
                    label="Dernier échange"
                    value={formatDate(stats.lastAt)}
                  />
                </View>
              ) : null}
            </ScrollView>
          </Animated.View>
        </GestureDetector>
      </GestureHandlerRootView>
    </Modal>
  );
}

function SheetAction({
  icon,
  label,
  onPress,
}: {
  icon: string;
  label: string;
  onPress: () => void;
}) {
  const colors = useAppTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.action, pressed && { opacity: 0.6 }]}
    >
      <View style={[styles.actionIcon, { backgroundColor: colors.primaryContainer }]}>
        <MaterialIcons name={icon as never} size={22} color={colors.onPrimaryContainer} />
      </View>
      <AppText variant="caption" weight="medium">
        {label}
      </AppText>
    </Pressable>
  );
}

function DetailRow({
  icon,
  label,
  value,
  onPress,
}: {
  icon: string;
  label: string;
  value: ReactNode;
  onPress?: () => void;
}) {
  const colors = useAppTheme();
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={styles.row}>
      <MaterialIcons name={icon as never} size={20} color={colors.primary} />
      <View style={styles.rowText}>
        <AppText variant="caption" color="textMuted">
          {label}
        </AppText>
        <AppText weight="medium">{value}</AppText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(12, 14, 22, 0.45)',
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: '88%',
    borderTopLeftRadius: Radius.lg,
    borderTopRightRadius: Radius.lg,
    elevation: 16,
  },
  handleArea: {
    alignItems: 'center',
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.xs,
  },
  handle: {
    width: 40,
    height: 5,
    borderRadius: 3,
  },
  content: {
    paddingHorizontal: Spacing.lg,
    gap: Spacing.lg,
  },
  hero: {
    alignItems: 'center',
    gap: Spacing.xs,
    paddingTop: Spacing.sm,
  },
  center: {
    textAlign: 'center',
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Spacing.xl,
  },
  action: {
    alignItems: 'center',
    gap: Spacing.xs,
  },
  actionIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    borderRadius: Radius.md,
    paddingVertical: Spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
});
