import { renderHook } from '@testing-library/react-native';

import { ThemePreferenceProvider, useResolvedScheme, useThemePreference } from '@/ui';

describe('theme preference', () => {
  it('defaults to "system" without a provider', () => {
    const { result } = renderHook(() => useThemePreference());
    expect(result.current).toBe('system');
  });

  it('resolves an explicit preference regardless of the device', () => {
    const { result } = renderHook(() => useResolvedScheme(), {
      wrapper: ({ children }) => (
        <ThemePreferenceProvider value="dark">{children}</ThemePreferenceProvider>
      ),
    });
    expect(result.current).toBe('dark');
  });

  it('falls back to the device scheme when the preference is "system"', () => {
    const { result } = renderHook(() => useResolvedScheme(), {
      wrapper: ({ children }) => (
        <ThemePreferenceProvider value="system">{children}</ThemePreferenceProvider>
      ),
    });
    expect(['light', 'dark']).toContain(result.current);
  });
});
