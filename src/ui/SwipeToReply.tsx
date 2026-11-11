import { MaterialIcons } from '@expo/vector-icons';
import { useRef, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import ReanimatedSwipeable, {
  type SwipeableMethods,
} from 'react-native-gesture-handler/ReanimatedSwipeable';

import { useAppTheme } from './theme';

export interface SwipeToReplyProps {
  children: ReactNode;
  onReply: () => void;
  enabled?: boolean;
}

/** Swipe a bubble to the right to answer it; it springs back immediately. */
export function SwipeToReply({ children, onReply, enabled = true }: SwipeToReplyProps) {
  const colors = useAppTheme();
  const ref = useRef<SwipeableMethods>(null);

  return (
    <ReanimatedSwipeable
      ref={ref}
      enabled={enabled}
      friction={2}
      leftThreshold={56}
      overshootLeft={false}
      renderLeftActions={() => (
        <View style={styles.action}>
          <View style={[styles.icon, { backgroundColor: colors.surface }]}>
            <MaterialIcons name="reply" size={20} color={colors.textSecondary} />
          </View>
        </View>
      )}
      onSwipeableWillOpen={() => {
        onReply();
        ref.current?.close();
      }}
    >
      {children}
    </ReanimatedSwipeable>
  );
}

const styles = StyleSheet.create({
  action: {
    width: 64,
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
