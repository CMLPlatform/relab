import { type ReactNode, useCallback, useMemo } from 'react';
import { useAuth } from '@/context/auth';
import {
  ThemeModeContext,
  type ThemeModeContextValue,
  useSystemColorScheme,
} from '@/context/themeMode';
import { updateUser } from '@/services/api/auth/authentication';
import type { ThemeMode } from '@/types/User';

export function ThemeModeProvider({ children }: { children: ReactNode }) {
  const systemScheme = useSystemColorScheme();
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
