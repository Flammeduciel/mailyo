import { Stack } from 'expo-router';
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';

export default function LoginScreen() {
  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ headerShown: true, title: 'Connexion' }} />
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <ThemedText type="subtitle">Connexion IMAP</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Configuration d&apos;un compte : hôte IMAP/SMTP, mot de passe ou OAuth2.
        </ThemedText>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1, padding: Spacing.four, gap: Spacing.three },
});
