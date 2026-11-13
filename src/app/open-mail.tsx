/**
 * Where a tapped mail notification lands (like a chat app: straight into the
 * conversation).
 *
 * - App notifications carry `thread`.
 * - The real-time service (app possibly closed) only knows the mail:
 *   `account`, `mid` (Message-ID) and `from`. If the mail is not synced yet,
 *   a sync runs first. Unknown mail falls back to the conversation list.
 */

import { router, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { useApp } from '@/state/app-context';
import { useAppTheme } from '@/ui';

export default function OpenMailScreen() {
  const colors = useAppTheme();
  const { service, refresh } = useApp();
  const params = useLocalSearchParams<{
    thread?: string;
    account?: string;
    mid?: string;
    from?: string;
  }>();

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const query = { accountId: params.account, messageIdHeader: params.mid, from: params.from };
      let threadId = params.thread || (await service.findThreadForNotification(query));
      if (!threadId && (params.mid || params.from)) {
        await refresh().catch(() => undefined);
        threadId = await service.findThreadForNotification(query);
      }
      if (cancelled) return;
      // Back from the conversation returns to the list, even after a cold start.
      router.replace('/discussions');
      if (threadId) {
        router.push({ pathname: '/thread/[id]', params: { id: threadId } });
      }
    })();
    return () => {
      cancelled = true;
    };
    // Runs once per opened link.
  }, [params.thread, params.account, params.mid, params.from, service, refresh]);

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <ActivityIndicator color={colors.primary} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
