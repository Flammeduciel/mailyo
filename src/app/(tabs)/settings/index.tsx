import { Link } from 'expo-router';
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';

export default function SettingsScreen() {
  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ThemedText type="subtitle">Paramètres</ThemedText>
        <ThemedView type="backgroundElement" style={styles.section}>
          <ThemedText type="smallBold">Comptes</ThemedText>
          <Link href="/login" asChild>
            <ThemedText type="linkPrimary">Ajouter un compte</ThemedText>
          </Link>
        </ThemedView>
        <ThemedView type="backgroundElement" style={styles.section}>
          <ThemedText type="smallBold">Sons par expéditeur</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Aucune règle configurée.
          </ThemedText>
        </ThemedView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1, padding: Spacing.four, gap: Spacing.three },
  section: { padding: Spacing.three, borderRadius: Spacing.three, gap: Spacing.two },
});
