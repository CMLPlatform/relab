import { type ReactNode, useCallback, useMemo } from 'react';
import { useColorScheme } from 'react-native';
import { useAuth } from '@/context/auth';
import { ThemeModeContext, type ThemeModeContextValue } from '@/context/themeMode';
import { updateUser } from '@/services/api/authentication';
import type { ThemeMode } from '@/types/User';

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
