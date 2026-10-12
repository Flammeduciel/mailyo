import { Link } from 'expo-router';
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';

export default function InboxScreen() {
  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ThemedText type="subtitle">Inbox</ThemedText>
        <ThemedView style={styles.empty}>
          <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
            Aucun compte configuré. Ajoutez un compte IMAP pour voir vos messages.
          </ThemedText>
        </ThemedView>
        <Link href="/compose" asChild>
          <ThemedText type="linkPrimary">Nouveau message</ThemedText>
        </Link>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1, padding: Spacing.four, gap: Spacing.three },
  empty: { flex: 1, justifyContent: 'center' },
  center: { textAlign: 'center' },
});
