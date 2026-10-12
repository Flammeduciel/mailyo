import { StyleSheet, View } from 'react-native';

import { AppText } from './AppText';
import { Spacing } from './theme';

export interface SectionTitleProps {
  title: string;
}

export function SectionTitle({ title }: SectionTitleProps) {
  return (
    <View style={styles.container}>
      <AppText variant="label" weight="semibold" color="textSecondary" style={styles.text}>
        {title.toUpperCase()}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.sm,
  },
  text: {
    letterSpacing: 0.8,
  },
});
