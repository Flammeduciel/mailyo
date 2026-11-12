import { MaterialIcons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from './AppText';
import { BottomSheet } from './BottomSheet';
import { AvatarTints, Spacing } from './theme';
import { useResolvedScheme } from './theme-preference';

export type AttachmentSource = 'gallery' | 'camera' | 'document';

export interface AttachmentPickerSheetProps {
  visible: boolean;
  onPick: (source: AttachmentSource) => void;
  onClose: () => void;
}

type IconName = React.ComponentProps<typeof MaterialIcons>['name'];

/** Bottom sheet asking which kind of item to attach (gallery, camera or document). */
export function AttachmentPickerSheet({ visible, onPick, onClose }: AttachmentPickerSheetProps) {
  const tints = AvatarTints[useResolvedScheme() === 'dark' ? 'dark' : 'light'];
  const options: {
    source: AttachmentSource;
    label: string;
    hint: string;
    icon: IconName;
    tint: string;
    bg: string;
  }[] = [
    {
      source: 'gallery',
      label: 'Galerie',
      hint: 'Joindre des photos ou des vidéos',
      icon: 'photo-library',
      tint: tints[0].fg,
      bg: tints[0].bg,
    },
    {
      source: 'camera',
      label: 'Appareil photo',
      hint: 'Prendre une photo',
      icon: 'photo-camera',
      tint: tints[2].fg,
      bg: tints[2].bg,
    },
    {
      source: 'document',
      label: 'Document',
      hint: 'Joindre un fichier',
      icon: 'insert-drive-file',
      tint: tints[1].fg,
      bg: tints[1].bg,
    },
  ];
  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title="Joindre"
      subtitle="Photos, vidéos ou fichiers"
      testID="attachment-sheet"
    >
      <View style={styles.row}>
        {options.map((option) => (
          <Pressable
            key={option.source}
            onPress={() => onPick(option.source)}
            accessibilityRole="button"
            accessibilityLabel={option.label}
            accessibilityHint={option.hint}
            testID={`attach-${option.source}`}
            style={({ pressed }) => [styles.option, pressed && { opacity: 0.6 }]}
          >
            <View style={[styles.tile, { backgroundColor: option.bg }]}>
              <MaterialIcons name={option.icon} size={28} color={option.tint} />
            </View>
            <AppText variant="caption" weight="medium" style={styles.label} numberOfLines={2}>
              {option.label}
            </AppText>
          </Pressable>
        ))}
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  option: { flex: 1, alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.xs },
  tile: { width: 64, height: 64, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  label: { textAlign: 'center' },
});
