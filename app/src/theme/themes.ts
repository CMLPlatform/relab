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
    primaryContainer: isDark ? 'rgb(20, 53, 103)' : 'rgb(216, 226, 255)',
    onPrimaryContainer: isDark ? 'rgb(216, 226, 255)' : 'rgb(0, 26, 65)',
    secondary: rgb(p.secondary),
    secondaryContainer: isDark ? 'rgb(62, 71, 89)' : 'rgb(218, 226, 249)',
    onSecondaryContainer: isDark ? 'rgb(218, 226, 249)' : 'rgb(19, 28, 43)',
    onTertiaryContainer: isDark ? 'rgb(255, 223, 158)' : 'rgb(42, 31, 0)',
    error: rgb(p.destructive),
    onError: rgb(p.destructiveForeground),
    errorContainer: isDark ? 'rgb(147, 0, 10)' : 'rgb(255, 218, 214)',
    onErrorContainer: isDark ? 'rgb(255, 180, 171)' : 'rgb(65, 0, 2)',
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
    elevation: {
      level1: isDark ? 'rgb(26, 32, 48)' : 'rgb(240, 243, 250)',
      level2: isDark ? 'rgb(30, 37, 55)' : 'rgb(234, 238, 248)',
      level4: isDark ? 'rgb(36, 44, 66)' : 'rgb(225, 231, 244)',
    },
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

/**
 * Hand-built react-navigation theme providing only the fields `Theme` requires
 * (`dark` + the six `colors` keys); expo-router's base theme already supplies
 * a valid `fonts` shape, so it's kept as-is rather than remapped from our type
 * scale (nothing in the app reads react-navigation's theme fonts).
 */
export function createNavigationThemes() {
  const LightTheme = {
    ...navigationLightTheme,
    colors: {
      ...navigationLightTheme.colors,
      primary: lightTheme.colors.primary,
      background: 'transparent',
      card: lightTheme.colors.elevation.level2,
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
      card: darkTheme.colors.elevation.level2,
      text: darkTheme.colors.onSurface,
      border: darkTheme.colors.outline,
      notification: darkTheme.colors.error,
    },
  };

  return { LightTheme, DarkTheme };
}
