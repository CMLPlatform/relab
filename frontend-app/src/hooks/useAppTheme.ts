import DarkTheme from '@/assets/themes/dark';
import LightTheme from '@/assets/themes/light';
import { useEffectiveColorScheme } from '@/context/ThemeModeProvider';

type AppTheme = typeof LightTheme;

/**
 * Returns the current theme based on the user's theme preference (or system default).
 * Use this instead of importing both theme files and checking useColorScheme() manually.
 */
export function useAppTheme(): AppTheme & { isDark: boolean } {
  const isDark = useEffectiveColorScheme() === 'dark';
  const theme = isDark ? DarkTheme : LightTheme;
  return { ...theme, isDark };
}
