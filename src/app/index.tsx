import { Redirect } from 'expo-router';

/**
 * Entry route.
 *
 * Expo Router matches the app's initial URL (`/`) here. There is no dedicated
 * home screen: the conversation list owns the "nothing yet" state, offering an
 * "add account" action until a first account exists, so handing over to it
 * keeps first-run onboarding in one place.
 */
export default function Index() {
  return <Redirect href="/discussions" />;
}
