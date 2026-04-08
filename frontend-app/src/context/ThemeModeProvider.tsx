import { createContext, type ReactNode, useCallback, useContext, useMemo } from 'react';
import { useColorScheme } from 'react-native';
import { useAuth } from '@/context/AuthProvider';
import { updateUser } from '@/services/api/authentication';
import type { ThemeMode } from '@/types/User';

type ThemeModeContextValue = {
  /** The user's stored preference ('light' | 'dark' | 'auto'). Defaults to 'auto'. */
  themeMode: ThemeMode;
  /** Resolved scheme after applying the preference over the system default. */
  effectiveColorScheme: 'light' | 'dark';
  /** Persist a new theme mode to the user's server-side preferences. */
  setThemeMode: (mode: ThemeMode) => Promise<void>;
};

const ThemeModeContext = createContext<ThemeModeContextValue | null>(null);

export function ThemeModeProvider({ children }: { children: ReactNode }) {
  const rawSystemScheme = useColorScheme();
  const systemScheme: 'light' | 'dark' = rawSystemScheme === 'dark' ? 'dark' : 'light';
  const { user, refetch } = useAuth();

  const themeMode: ThemeMode = user?.preferences?.theme_mode ?? 'auto';

  const effectiveColorScheme = useMemo<'light' | 'dark'>(() => {
    if (themeMode === 'auto') return systemScheme;
    return themeMode;
  }, [themeMode, systemScheme]);

  const setThemeMode = useCallback(
    async (mode: ThemeMode) => {
      await updateUser({ preferences: { theme_mode: mode } });
      await refetch(false);
    },
    [refetch],
  );

  const value = useMemo<ThemeModeContextValue>(
    () => ({ themeMode, effectiveColorScheme, setThemeMode }),
    [themeMode, effectiveColorScheme, setThemeMode],
  );

  return <ThemeModeContext.Provider value={value}>{children}</ThemeModeContext.Provider>;
}

/**
 * Returns the resolved color scheme ('light' | 'dark'), respecting the user's
 * theme preference when authenticated and falling back to the system setting.
 *
 * Drop-in replacement for `useColorScheme()` from react-native.
 */
export function useEffectiveColorScheme(): 'light' | 'dark' {
  const ctx = useContext(ThemeModeContext);
  // Outside provider (e.g. tests), fall back to system.
  const rawScheme = useColorScheme();
  const systemScheme: 'light' | 'dark' = rawScheme === 'dark' ? 'dark' : 'light';
  return ctx?.effectiveColorScheme ?? systemScheme;
}

/** Full context access — use in the profile page for the theme picker. */
export function useThemeMode() {
  const ctx = useContext(ThemeModeContext);
  if (!ctx) throw new Error('useThemeMode must be used within ThemeModeProvider');
  return ctx;
}
