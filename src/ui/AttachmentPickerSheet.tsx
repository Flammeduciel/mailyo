import { MaterialIcons } from '@expo/vector-icons';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from './AppText';
import { Radius, Spacing, useAppTheme } from './theme';

export type AttachmentSource = 'gallery' | 'camera' | 'document';

export interface AttachmentPickerSheetProps {
  visible: boolean;
  onPick: (source: AttachmentSource) => void;
  onClose: () => void;
}

type IconName = React.ComponentProps<typeof MaterialIcons>['name'];

/** Bottom sheet asking which kind of item to attach (gallery, camera or document). */
export function AttachmentPickerSheet({ visible, onPick, onClose }: AttachmentPickerSheetProps) {
  const colors = useAppTheme();
  const insets = useSafeAreaInsets();
  const options: {
    source: AttachmentSource;
    label: string;
    hint: string;
    icon: IconName;
    tint: string;
  }[] = [
    {
      source: 'gallery',
      label: 'Galerie',
      hint: 'Joindre des photos ou des vidéos',
      icon: 'photo-library',
      tint: colors.primary,
    },
    {
      source: 'camera',
      label: 'Appareil photo',
      hint: 'Prendre une photo',
      icon: 'photo-camera',
      tint: colors.warning,
    },
    {
      source: 'document',
      label: 'Document',
      hint: 'Joindre un fichier',
      icon: 'insert-drive-file',
      tint: colors.success,
    },
  ];
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Fermer" />
      <View
        style={[
          styles.sheet,
          { backgroundColor: colors.surface, paddingBottom: insets.bottom + Spacing.lg },
        ]}
      >
        <View style={[styles.handle, { backgroundColor: colors.border }]} />
        <AppText variant="subtitle" weight="semibold" style={styles.title}>
          Joindre
        </AppText>
        <AppText variant="caption" color="textSecondary" style={styles.caption}>
          Photos, vidéos ou fichiers
        </AppText>
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
              <View style={[styles.tile, { backgroundColor: `${option.tint}26` }]}>
                <MaterialIcons name={option.icon} size={30} color={option.tint} />
              </View>
              <AppText variant="caption" weight="medium" style={styles.label} numberOfLines={2}>
                {option.label}
              </AppText>
            </Pressable>
          ))}
        </View>
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
  title: { paddingHorizontal: Spacing.lg },
  caption: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.md },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
  },
  option: { flex: 1, alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.xs },
  tile: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
  label: { textAlign: 'center' },
});
