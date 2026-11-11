import { Tabs, useFocusEffect } from 'expo-router';
import { useCallback } from 'react';

import { useServiceQuery } from '@/state/use-service-query';
import { BottomTabBar, type TabMeta } from '@/ui';

interface TabBadges {
  discussions: number;
  actus: number;
  groupes: number;
}

const NO_BADGES: TabBadges = { discussions: 0, actus: 0, groupes: 0 };

export default function TabsLayout() {
  // Unread conversation count per tab, refreshed after every app mutation.
  const { data: badges, reload } = useServiceQuery<TabBadges>(async (service) => {
    const count = async (tab: 'discussions' | 'actus' | 'groupes') =>
      (await service.listConversations({ tab, filter: 'unread' })).length;
    const [discussions, actus, groupes] = await Promise.all([
      count('discussions'),
      count('actus'),
      count('groupes'),
    ]);
    return { discussions, actus, groupes };
  }, NO_BADGES);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  const meta: Record<string, TabMeta> = {
    discussions: { icon: 'chat-bubble-outline', activeIcon: 'chat', badge: badges.discussions },
    actus: { icon: 'campaign', badge: badges.actus },
    groupes: { icon: 'groups', badge: badges.groupes },
    favoris: { icon: 'star-border', activeIcon: 'star' },
  };

  return (
    <Tabs
      screenOptions={{ headerShown: false }}
      tabBar={(props) => <BottomTabBar {...props} meta={meta} />}
    >
      <Tabs.Screen name="discussions" options={{ title: 'Discussions' }} />
      <Tabs.Screen name="actus" options={{ title: 'Actus' }} />
      <Tabs.Screen name="groupes" options={{ title: 'Groupes' }} />
      <Tabs.Screen name="favoris" options={{ title: 'Favoris' }} />
    </Tabs>
  );
}
