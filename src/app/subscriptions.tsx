import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { MailingSender } from '@/services/mail-service';
import { useApp } from '@/state/app-context';
import { useServiceQuery } from '@/state/use-service-query';
import {
  AppBar,
  AppText,
  Avatar,
  Divider,
  EmptyState,
  formatThreadTime,
  Radius,
  Spacing,
  useAppTheme,
} from '@/ui';
import { openLink } from '@/ui/open-link';

type Subscription = MailingSender & { unsubscribed: boolean };

/**
 * Newsletters and promotional senders (they carry a List-Unsubscribe header),
 * most frequent first, each with a one-tap "Se désabonner".
 */
export default function SubscriptionsScreen() {
  const colors = useAppTheme();
  const { service, invalidate } = useApp();
  const [busy, setBusy] = useState<string | null>(null);

  const { data, loading, reload } = useServiceQuery<{ list: Subscription[]; now: number }>(
    async (mailService) => ({ list: await mailService.listSubscriptions(), now: Date.now() }),
    { list: [], now: 0 },
  );

  const unsubscribe = async (sender: Subscription) => {
    setBusy(sender.address);
    try {
      const result = await service.unsubscribe(sender);
      if (result.kind === 'open') {
        await openLink(result.url);
      }
      if (result.kind === 'failed') {
        Alert.alert('Désabonnement impossible', 'Cet expéditeur ne propose pas de désabonnement.');
        return;
      }
      Alert.alert('Désabonné', `Archiver aussi les mails de ${sender.name || sender.address} ?`, [
        { text: 'Garder', style: 'cancel' },
        {
          text: 'Archiver',
          onPress: () => void service.archiveSender(sender.address).then(() => invalidate()),
        },
      ]);
      await reload();
    } finally {
      setBusy(null);
    }
  };

  const active = data.list.filter((s) => !s.unsubscribed).length;

  return (
    <SafeAreaView edges={['top']} style={[styles.screen, { backgroundColor: colors.background }]}>
      <AppBar
        title="Abonnements"
        subtitle={
          data.list.length > 0
            ? `${active} actif${active > 1 ? 's' : ''} · ${data.list.length} expéditeur${data.list.length > 1 ? 's' : ''}`
            : undefined
        }
        onBack={() => router.back()}
      />
      <FlatList
        data={data.list}
        keyExtractor={(item) => item.address}
        ItemSeparatorComponent={() => <Divider inset={Spacing.lg + 44 + Spacing.md} />}
        ListHeaderComponent={
          data.list.length > 0 ? (
            <AppText variant="caption" color="textSecondary" style={styles.intro}>
              Newsletters et envois publicitaires détectés dans vos mails. Le désabonnement se fait
              en un appui quand l’expéditeur le permet.
            </AppText>
          ) : null
        }
        renderItem={({ item }) => (
          <View style={styles.row}>
            <Avatar
              name={item.name || item.address}
              size={44}
              imageUri={service.getContactPhoto(item.address)}
            />
            <View style={styles.text}>
              <AppText weight="semibold" numberOfLines={1}>
                {item.name || item.address}
              </AppText>
              <AppText variant="caption" color="textSecondary" numberOfLines={1}>
                {item.count} mail{item.count > 1 ? 's' : ''} · dernier :{' '}
                {formatThreadTime(item.lastAt, data.now)}
              </AppText>
            </View>
            {item.unsubscribed ? (
              <View style={[styles.done, { backgroundColor: colors.surfaceAlt }]}>
                <MaterialIcons name="check" size={16} color={colors.success} />
                <AppText variant="caption" weight="semibold" style={{ color: colors.success }}>
                  Désabonné
                </AppText>
              </View>
            ) : busy === item.address ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <Pressable
                onPress={() => void unsubscribe(item)}
                style={({ pressed }) => [
                  styles.button,
                  { backgroundColor: colors.dangerContainer, opacity: pressed ? 0.7 : 1 },
                ]}
                accessibilityRole="button"
                accessibilityLabel={`Se désabonner de ${item.name || item.address}`}
                testID={`unsubscribe-${item.address}`}
              >
                <AppText variant="caption" weight="semibold" style={{ color: colors.danger }}>
                  Se désabonner
                </AppText>
              </Pressable>
            )}
          </View>
        )}
        ListEmptyComponent={
          loading ? (
            <View style={styles.loading}>
              <ActivityIndicator color={colors.primary} size="large" />
              <AppText variant="caption" color="textSecondary">
                Recherche des newsletters…
              </AppText>
            </View>
          ) : (
            <EmptyState
              icon="unsubscribe"
              title="Aucun abonnement détecté"
              description="Les newsletters apparaîtront ici dès qu’elles arrivent."
            />
          )
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  intro: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  text: { flex: 1 },
  button: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm - 2,
    borderRadius: Radius.pill,
  },
  done: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.lg,
  },
  loading: { alignItems: 'center', gap: Spacing.md, paddingTop: 80 },
});
