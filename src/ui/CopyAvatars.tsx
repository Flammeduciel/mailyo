import { MaterialIcons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { joinNames } from '@/domain/copies';
import type { EmailAddress } from '@/domain/models';

import { AppText } from './AppText';
import { Avatar } from './Avatar';
import { Spacing, useAppTheme } from './theme';

const MAX_FACES = 4;

export interface CopyAvatarsProps {
  people: EmailAddress[];
  photoOf?: (address: string) => string | undefined;
  /** Called with the tapped person (a face), or with everyone (the names). */
  onPress: (people: EmailAddress[]) => void;
  /** Text colour of the bubble the row sits in. */
  textColor?: string;
  testID?: string;
}

/** "Cc" line under a bubble: overlapping faces of the people in copy, then their names. */
export function CopyAvatars({ people, photoOf, onPress, textColor, testID }: CopyAvatarsProps) {
  const colors = useAppTheme();
  if (people.length === 0) return null;
  const shown = people.slice(0, MAX_FACES);
  const extra = people.length - shown.length;

  return (
    <Pressable
      onPress={() => onPress(people)}
      style={[styles.row, { borderTopColor: colors.border }]}
      accessibilityRole="button"
      accessibilityLabel={`En copie : ${joinNames(people)}`}
      testID={testID}
    >
      <MaterialIcons name="group" size={14} color={colors.textMuted} />
      <AppText variant="caption" weight="semibold" style={{ color: colors.textMuted }}>
        Cc
      </AppText>
      <View style={styles.faces}>
        {shown.map((person, index) => (
          <Pressable
            key={person.address}
            onPress={() => onPress([person])}
            hitSlop={4}
            style={[
              styles.face,
              {
                marginLeft: index === 0 ? 0 : -8,
                borderColor: colors.surface,
                zIndex: MAX_FACES - index,
              },
            ]}
            accessibilityLabel={person.name || person.address}
          >
            <Avatar
              name={person.name || person.address}
              size={22}
              imageUri={photoOf?.(person.address)}
            />
          </Pressable>
        ))}
        {extra > 0 ? (
          <View
            style={[
              styles.face,
              styles.more,
              {
                marginLeft: -8,
                borderColor: colors.surface,
                backgroundColor: colors.primaryContainer,
              },
            ]}
          >
            <AppText
              variant="caption"
              weight="semibold"
              style={{ fontSize: 10, color: colors.onPrimaryContainer }}
            >
              +{extra}
            </AppText>
          </View>
        ) : null}
      </View>
      <AppText
        variant="caption"
        numberOfLines={1}
        style={[styles.names, { color: textColor ?? colors.textSecondary }]}
      >
        {joinNames(people)}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingTop: Spacing.xs,
    marginTop: 2,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  faces: { flexDirection: 'row', alignItems: 'center' },
  face: { borderWidth: 1.5, borderRadius: 13 },
  more: { width: 25, height: 25, alignItems: 'center', justifyContent: 'center' },
  names: { flexShrink: 1, opacity: 0.85 },
});
