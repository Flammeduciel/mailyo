import { Stack } from 'expo-router';
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';

export default function ComposeScreen() {
  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ headerShown: true, title: 'Nouveau message' }} />
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <ThemedText type="smallBold">Composer un email</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Destinataire, objet et contenu via SMTP direct.
        </ThemedText>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1, padding: Spacing.four, gap: Spacing.three },
});
