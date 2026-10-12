import { Tabs } from 'expo-router';
import { SymbolView, type AndroidSymbol, type SFSymbol } from 'expo-symbols';
import { View } from 'react-native';

import { FontSize, useAppTheme } from '@/ui';

function TabIcon({ icon, color }: { icon: string; color: string }) {
  return (
    <SymbolView
      name={{ ios: icon as SFSymbol, android: icon as AndroidSymbol, web: icon as AndroidSymbol }}
      size={FontSize.lg}
      tintColor={color}
      fallback={<View style={{ width: FontSize.lg, height: FontSize.lg }} />}
    />
  );
}

export default function TabsLayout() {
  const colors = useAppTheme();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: { backgroundColor: colors.background, borderTopColor: colors.border },
      }}
    >
      <Tabs.Screen
        name="inbox"
        options={{
          title: 'Réception',
          tabBarIcon: ({ color }) => <TabIcon icon="tray.fill" color={color as string} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Paramètres',
          tabBarIcon: ({ color }) => <TabIcon icon="gearshape.fill" color={color as string} />,
        }}
      />
    </Tabs>
  );
}
