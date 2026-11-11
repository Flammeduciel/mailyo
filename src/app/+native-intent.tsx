/**
 * Intercepts deep links before Expo Router turns them into navigation.
 *
 * The Google OAuth redirect (`com.anonymous.mailyo:/oauthredirect?code=…`) is
 * consumed by `expo-auth-session` (see `providers/oauth/gmail-oauth.ts`), not by
 * a screen. Letting the router handle it would show "Unmatched Route" on top of
 * the login screen while the code exchange is still running.
 */
export function redirectSystemPath({ path, initial }: { path: string; initial: boolean }) {
  if (path.includes('oauthredirect')) {
    // `null` ignores the link; on a cold start the router needs a real path.
    return initial ? '/' : null;
  }
  return path;
}
