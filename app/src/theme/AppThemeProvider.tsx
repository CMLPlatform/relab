import { type ReactNode, useMemo } from 'react';
import { AppThemeContext } from './appThemeContext';
import { getAppTheme } from './themes';
import type { AppScheme } from './types';

/** Delivers the full AppTheme (MD3 color/font roles + app tokens) without Paper. */
export function AppThemeProvider({ scheme, children }: { scheme: AppScheme; children: ReactNode }) {
  const theme = useMemo(() => getAppTheme(scheme), [scheme]);
  return <AppThemeContext.Provider value={theme}>{children}</AppThemeContext.Provider>;
}
