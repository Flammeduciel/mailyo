import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { EmailAddress } from '@/domain/models';

import { AppText } from './AppText';
import { Avatar } from './Avatar';
import { Radius, Spacing, useAppTheme } from './theme';

export interface PeopleSheetProps {
  title: string;
  people: EmailAddress[];
  photoOf?: (address: string) => string | undefined;
  onPick: (person: EmailAddress) => void;
  onClose: () => void;
}

/** Bottom sheet listing several people (those in copy); picking one opens their contact. */
export function PeopleSheet({ title, people, photoOf, onPick, onClose }: PeopleSheetProps) {
  const colors = useAppTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Fermer" />
      <View
        style={[
          styles.sheet,
          { backgroundColor: colors.surface, paddingBottom: insets.bottom + Spacing.md },
        ]}
      >
        <View style={[styles.handle, { backgroundColor: colors.border }]} />
        <AppText variant="subtitle" weight="semibold" style={styles.title}>
          {title}
        </AppText>
        {people.map((person) => (
          <Pressable
            key={person.address}
            onPress={() => onPick(person)}
            style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surfaceAlt }]}
            testID={`person-${person.address}`}
          >
            <Avatar
              name={person.name || person.address}
              size={44}
              imageUri={photoOf?.(person.address)}
            />
            <View style={styles.text}>
              <AppText weight="semibold" numberOfLines={1}>
                {person.name || person.address}
              </AppText>
              {person.name ? (
                <AppText variant="caption" color="textSecondary" numberOfLines={1}>
                  {person.address}
                </AppText>
              ) : null}
            </View>
          </Pressable>
        ))}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: Radius.lg,
    borderTopRightRadius: Radius.lg,
    paddingTop: Spacing.sm,
    elevation: 16,
  },
  handle: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, marginBottom: Spacing.sm },
  title: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  text: { flex: 1 },
});
