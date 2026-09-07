import { createContext, useContext } from 'react';
import { lightTheme } from './themes';
import type { AppTheme } from './types';

// Split from AppThemeProvider.tsx (react-refresh/only-export-components).
export const AppThemeContext = createContext<AppTheme>(lightTheme);

export function useAppTheme(): AppTheme {
  return useContext(AppThemeContext);
}
