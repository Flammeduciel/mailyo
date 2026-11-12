import { useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import type { EmailAddress } from '@/domain/models';

import { AppText } from './AppText';
import { Avatar } from './Avatar';
import { BottomSheet, type BottomSheetHandle } from './BottomSheet';
import { Spacing, useAppTheme } from './theme';

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
  const sheet = useRef<BottomSheetHandle>(null);
  return (
    <BottomSheet ref={sheet} visible onClose={onClose} title={title} testID="people-sheet">
      <ScrollView contentContainerStyle={styles.list}>
        {people.map((person) => (
          <Pressable
            key={person.address}
            onPress={() => sheet.current?.dismiss(() => onPick(person))}
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
      </ScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  list: { paddingTop: Spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.sm,
  },
  text: { flex: 1 },
});
