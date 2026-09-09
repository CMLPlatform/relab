import {
  DarkTheme as navigationDarkTheme,
  DefaultTheme as navigationLightTheme,
} from 'expo-router';
import { palette } from './palette.generated';
import { createTokens } from './tokens';
import type { AppScheme, AppTheme } from './types';

/** '#1F4C96' -> 'rgb(31, 76, 150)' — matches the previous MD3-derived string format exactly. */
function rgb(hex: string): string {
  const n = Number.parseInt(hex.slice(1), 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
}

function createThemeColors(isDark: boolean) {
  const p = isDark ? palette.dark : palette.light;
  return {
    primary: rgb(p.primary),
    onPrimary: rgb(p.primaryForeground),
    secondary: rgb(p.secondary),
    error: rgb(p.destructive),
    onError: rgb(p.destructiveForeground),
    background: rgb(p.background),
    onBackground: rgb(p.foreground),
    surface: rgb(p.background),
    onSurface: rgb(p.foreground),
    surfaceVariant: isDark ? 'rgb(68, 71, 79)' : 'rgb(224, 226, 236)',
    onSurfaceVariant: rgb(p.mutedForeground),
    outline: rgb(p.input),
    shadow: 'rgb(0, 0, 0)',
    scrim: 'rgb(0, 0, 0)',
    inverseSurface: isDark ? 'rgb(226, 230, 238)' : 'rgb(47, 48, 54)',
    inverseOnSurface: isDark ? 'rgb(47, 48, 54)' : 'rgb(240, 243, 249)',
    card: rgb(p.card),
  };
}

function createTheme(scheme: AppScheme): AppTheme {
  const isDark = scheme === 'dark';
  const colors = createThemeColors(isDark);
  return {
    colors,
    dark: isDark,
    scheme,
    tokens: createTokens(scheme, colors),
  };
}

export const lightTheme = createTheme('light');
export const darkTheme = createTheme('dark');

export function getAppTheme(scheme: AppScheme) {
  return scheme === 'dark' ? darkTheme : lightTheme;
}

/** react-navigation theme: `dark` + the six `colors` keys. `fonts` keeps expo-router's base shape. */
export function createNavigationThemes() {
  const LightTheme = {
    ...navigationLightTheme,
    colors: {
      ...navigationLightTheme.colors,
      primary: lightTheme.colors.primary,
      background: 'transparent',
      card: lightTheme.colors.card,
      text: lightTheme.colors.onSurface,
      border: lightTheme.colors.outline,
      notification: lightTheme.colors.error,
    },
  };
  const DarkTheme = {
    ...navigationDarkTheme,
    colors: {
      ...navigationDarkTheme.colors,
      primary: darkTheme.colors.primary,
      background: 'transparent',
      card: darkTheme.colors.card,
      text: darkTheme.colors.onSurface,
      border: darkTheme.colors.outline,
      notification: darkTheme.colors.error,
    },
  };

  return { LightTheme, DarkTheme };
}
