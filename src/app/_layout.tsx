import * as Notifications from 'expo-notifications';
import { DarkTheme, DefaultTheme, router, Stack, ThemeProvider, type Href } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AppProvider, useApp } from '@/state/app-context';
import { AppText, Button, Screen, SheetHost, Spacing, useResolvedScheme } from '@/ui';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AppProvider>
          <AppShell />
        </AppProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

/** Navigation chrome follows the persisted theme; the lock screen replaces it. */
function AppShell() {
  const { locked } = useApp();
  const scheme = useResolvedScheme();
  useOpenTappedNotification(locked);

  return (
    <ThemeProvider value={scheme === 'dark' ? DarkTheme : DefaultTheme}>
      {locked ? (
        <LockScreen />
      ) : (
        <Stack>
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="login" options={{ headerShown: false, presentation: 'modal' }} />
          <Stack.Screen name="compose" options={{ headerShown: false, presentation: 'modal' }} />
          <Stack.Screen name="thread/[id]" options={{ headerShown: false }} />
          <Stack.Screen name="files/[id]" options={{ headerShown: false }} />
          <Stack.Screen name="contact/[address]" options={{ headerShown: false }} />
          <Stack.Screen name="subscriptions" options={{ headerShown: false }} />
          <Stack.Screen name="imap-login" options={{ headerShown: false }} />
          <Stack.Screen name="search" options={{ headerShown: false }} />
          <Stack.Screen name="settings" options={{ headerShown: false }} />
          <Stack.Screen name="archived" options={{ headerShown: false }} />
          <Stack.Screen name="rules/edit" options={{ headerShown: false }} />
          <Stack.Screen name="onboarding" options={{ headerShown: false }} />
          <Stack.Screen name="trash" options={{ headerShown: false }} />
          <Stack.Screen name="welcome" options={{ headerShown: false, animation: 'fade' }} />
          <Stack.Screen name="mailbox/[id]" options={{ headerShown: false }} />
          <Stack.Screen name="open-mail" options={{ headerShown: false, animation: 'none' }} />
        </Stack>
      )}
      <SheetHost />
    </ThemeProvider>
  );
}

/** A tapped app notification opens its conversation (once unlocked). */
function useOpenTappedNotification(locked: boolean) {
  const response = Notifications.useLastNotificationResponse();
  const handled = useRef<string | null>(null);
  useEffect(() => {
    if (locked || !response) return;
    if (response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
    const id = response.notification.request.identifier;
    const url = response.notification.request.content.data?.url;
    if (handled.current === id || typeof url !== 'string' || !url.startsWith('/open-mail')) return;
    handled.current = id;
    router.push(url as Href);
    void Notifications.clearLastNotificationResponseAsync();
  }, [response, locked]);
}

function LockScreen() {
  const { unlock } = useApp();

  // Prompt for biometrics straight away; the button retries if it is dismissed.
  useEffect(() => {
    void unlock();
  }, [unlock]);

  return (
    <Screen>
      <View style={styles.lock}>
        <AppText variant="title" weight="semibold">
          Wouah Mail verrouillé
        </AppText>
        <AppText variant="body" color="textSecondary" style={styles.lockDescription}>
          Déverrouillez avec Face ID ou votre empreinte pour accéder à vos messages.
        </AppText>
        <Button label="Déverrouiller" onPress={() => void unlock()} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  lock: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
    gap: Spacing.md,
  },
  lockDescription: {
    textAlign: 'center',
  },
});
