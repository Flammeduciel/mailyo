import { createContext, useContext, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';

/** User preference for the colour scheme; `system` follows the device. */
export type ThemePreference = 'system' | 'light' | 'dark';

const ThemePreferenceContext = createContext<ThemePreference>('system');

/**
 * Provide the persisted theme preference to the design system. Defaults to
 * `system`, so components rendered outside the provider still work.
 */
export function ThemePreferenceProvider({
  value,
  children,
}: {
  value: ThemePreference;
  children: ReactNode;
}) {
  return (
    <ThemePreferenceContext.Provider value={value}>{children}</ThemePreferenceContext.Provider>
  );
}

export function useThemePreference(): ThemePreference {
  return useContext(ThemePreferenceContext);
}

/** The effective scheme: the preference when set, otherwise the device's. */
export function useResolvedScheme(): 'light' | 'dark' {
  const preference = useThemePreference();
  const system = useColorScheme();
  if (preference === 'light' || preference === 'dark') {
    return preference;
  }
  return system === 'dark' ? 'dark' : 'light';
}
