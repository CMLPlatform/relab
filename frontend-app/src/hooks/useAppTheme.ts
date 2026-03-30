import { useColorScheme } from 'react-native';
import LightTheme from '@/assets/themes/light';
import DarkTheme from '@/assets/themes/dark';

type AppTheme = typeof LightTheme;

/**
 * Returns the current theme based on the device color scheme.
 * Use this instead of importing both theme files and checking useColorScheme() manually.
 */
export function useAppTheme(): AppTheme & { isDark: boolean } {
  const isDark = useColorScheme() === 'dark';
  const theme = isDark ? DarkTheme : LightTheme;
  return { ...theme, isDark };
}
