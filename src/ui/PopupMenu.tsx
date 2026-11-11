import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from './AppText';
import { Spacing, useAppTheme } from './theme';

export interface PopupMenuItem {
  label: string;
  onPress: () => void;
  destructive?: boolean;
}

export interface PopupMenuProps {
  visible: boolean;
  items: PopupMenuItem[];
  onClose: () => void;
}

/** Overflow (⋮) menu anchored to the top-right corner, dismissed by tapping outside. */
export function PopupMenu({ visible, items, onClose }: PopupMenuProps) {
  const colors = useAppTheme();
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} testID="popup-menu-backdrop">
        <View
          style={[styles.menu, { top: insets.top + Spacing.sm, backgroundColor: colors.surface }]}
        >
          {items.map((item) => (
            <Pressable
              key={item.label}
              accessibilityRole="menuitem"
              onPress={() => {
                onClose();
                item.onPress();
              }}
              style={({ pressed }) => [
                styles.item,
                pressed && { backgroundColor: colors.surfaceAlt },
              ]}
            >
              <AppText style={item.destructive ? { color: colors.danger } : undefined}>
                {item.label}
              </AppText>
            </Pressable>
          ))}
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  menu: {
    position: 'absolute',
    right: Spacing.sm,
    minWidth: 200,
    paddingVertical: Spacing.sm,
    borderRadius: 12,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
  },
  item: {
    paddingHorizontal: Spacing.lg + 4,
    paddingVertical: Spacing.md + 2,
  },
});
