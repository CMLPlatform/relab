import { createContext, useContext } from 'react';
import { useColorScheme } from 'react-native';
import type { ThemeMode } from '@/types/User';

export type ThemeModeContextValue = {
  themeMode: ThemeMode;
  effectiveColorScheme: 'light' | 'dark';
  setThemeMode: (mode: ThemeMode) => Promise<void>;
};

export const ThemeModeContext = createContext<ThemeModeContextValue | null>(null);

export function useEffectiveColorScheme(): 'light' | 'dark' {
  const ctx = useContext(ThemeModeContext);
  const rawScheme = useColorScheme();
  const systemScheme: 'light' | 'dark' = rawScheme === 'dark' ? 'dark' : 'light';
  return ctx?.effectiveColorScheme ?? systemScheme;
}

export function useThemeMode() {
  const ctx = useContext(ThemeModeContext);
  if (!ctx) throw new Error('useThemeMode must be used within ThemeModeProvider');
  return ctx;
}
