import { createContext, useContext } from 'react';
import { lightTheme } from './themes';
import type { AppTheme } from './types';

// Split from AppThemeProvider.tsx: react-refresh/only-export-components forbids
// mixing a component export with non-component exports in the same file (see
// context/themeMode.ts for the same pattern next to ThemeModeProvider.tsx).
export const AppThemeContext = createContext<AppTheme>(lightTheme);

export function useAppThemeContext(): AppTheme {
  return useContext(AppThemeContext);
}

export function useAppTheme(): AppTheme {
  return useAppThemeContext();
}
