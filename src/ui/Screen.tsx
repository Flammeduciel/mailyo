import type { ReactNode } from 'react';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';

import { useAppTheme } from './theme';

export interface ScreenProps {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Safe-area edges to inset. Defaults to top and bottom. */
  edges?: Edge[];
}

export function Screen({ children, style, edges = ['top', 'bottom'] }: ScreenProps) {
  const colors = useAppTheme();

  return (
    <SafeAreaView
      edges={edges}
      style={[styles.screen, { backgroundColor: colors.background }, style]}
    >
      {children}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
});
