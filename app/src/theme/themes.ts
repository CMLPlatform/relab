import {
  DarkTheme as navigationDarkTheme,
  DefaultTheme as navigationLightTheme,
} from 'expo-router';
import { Platform } from 'react-native';
import { palette } from './palette.generated';
import { createTokens } from './tokens';
import type { AppFonts, AppScheme, AppTheme } from './types';

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
    onSecondary: rgb(p.secondaryForeground),
    secondaryContainer: isDark ? 'rgb(62, 71, 89)' : 'rgb(218, 226, 249)',
    onSecondaryContainer: isDark ? 'rgb(218, 226, 249)' : 'rgb(19, 28, 43)',
    tertiary: rgb(p.accent),
    onTertiary: rgb(p.accentForeground),
    tertiaryContainer: isDark ? 'rgb(91, 67, 0)' : 'rgb(255, 223, 158)',
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
    outlineVariant: rgb(p.border),
    shadow: 'rgb(0, 0, 0)',
    scrim: 'rgb(0, 0, 0)',
    inverseSurface: isDark ? 'rgb(226, 230, 238)' : 'rgb(47, 48, 54)',
    inverseOnSurface: isDark ? 'rgb(47, 48, 54)' : 'rgb(240, 243, 249)',
    inversePrimary: isDark ? 'rgb(31, 76, 150)' : 'rgb(143, 184, 255)',
    elevation: {
      level0: 'transparent',
      level1: isDark ? 'rgb(26, 32, 48)' : 'rgb(240, 243, 250)',
      level2: isDark ? 'rgb(30, 37, 55)' : 'rgb(234, 238, 248)',
      level3: isDark ? 'rgb(34, 42, 62)' : 'rgb(227, 233, 245)',
      level4: isDark ? 'rgb(36, 44, 66)' : 'rgb(225, 231, 244)',
      level5: isDark ? 'rgb(39, 48, 71)' : 'rgb(220, 227, 241)',
    },
    surfaceDisabled: isDark ? 'rgba(226, 230, 238, 0.12)' : 'rgba(22, 32, 46, 0.12)',
    onSurfaceDisabled: isDark ? 'rgba(226, 230, 238, 0.38)' : 'rgba(22, 32, 46, 0.38)',
    backdrop: 'rgba(42, 47, 60, 0.4)',
  };
}

// Brand type scale (assets/DESIGN.md) over Paper's former MD3 default type scale;
// the app stays on platform system fonts, only sizes/tracking shift. Digits that
// must align keep using per-component `fontVariant: ['tabular-nums']`. Values
// below are the byte-identical output of the old `configureFonts({ config: {...} })`
// call, captured as literals so removing the dependency changes nothing at runtime.
const REGULAR_FAMILY = Platform.select({
  web: 'Roboto, "Helvetica Neue", Helvetica, Arial, sans-serif',
  ios: 'System',
  default: 'sans-serif',
});
const MEDIUM_FAMILY = Platform.select({
  web: 'Roboto, "Helvetica Neue", Helvetica, Arial, sans-serif',
  ios: 'System',
  default: 'sans-serif-medium',
});
const regularType = { fontFamily: REGULAR_FAMILY, letterSpacing: 0, fontWeight: '400' } as const;
const mediumType = { fontFamily: MEDIUM_FAMILY, letterSpacing: 0.15, fontWeight: '500' } as const;

const fonts: AppFonts = {
  displayLarge: { ...regularType, lineHeight: 64, fontSize: 57 },
  displayMedium: { ...regularType, lineHeight: 52, fontSize: 45 },
  displaySmall: { ...regularType, lineHeight: 44, fontSize: 38 },
  headlineLarge: { ...regularType, lineHeight: 40, fontSize: 32 },
  headlineMedium: { ...regularType, lineHeight: 36, fontSize: 28 },
  headlineSmall: { ...regularType, lineHeight: 30, fontSize: 24 },
  titleLarge: { ...regularType, lineHeight: 28, fontSize: 22 },
  titleMedium: { ...mediumType, lineHeight: 24, fontSize: 16 },
  titleSmall: { ...mediumType, letterSpacing: 0.1, lineHeight: 20, fontSize: 14 },
  labelLarge: { ...mediumType, letterSpacing: 0.1, lineHeight: 20, fontSize: 14 },
  labelMedium: { ...mediumType, letterSpacing: 1.3, lineHeight: 18, fontSize: 13 },
  labelSmall: { ...mediumType, letterSpacing: 0.5, lineHeight: 16, fontSize: 11 },
  bodyLarge: {
    ...mediumType,
    fontWeight: '400',
    fontFamily: REGULAR_FAMILY,
    lineHeight: 26,
    fontSize: 16,
  },
  bodyMedium: {
    ...mediumType,
    fontWeight: '400',
    fontFamily: REGULAR_FAMILY,
    letterSpacing: 0.25,
    lineHeight: 20,
    fontSize: 14,
  },
  bodySmall: {
    ...mediumType,
    fontWeight: '400',
    fontFamily: REGULAR_FAMILY,
    letterSpacing: 0.4,
    lineHeight: 16,
    fontSize: 12,
  },
};

function createTheme(scheme: AppScheme): AppTheme {
  const isDark = scheme === 'dark';
  const colors = createThemeColors(isDark);
  return {
    colors,
    fonts,
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
 * Hand-built react-navigation theme, replacing Paper's `adaptNavigationTheme`.
 * Only the fields react-navigation's `Theme` type requires are meaningful here
 * (`dark` + the six `colors` keys) — expo-router's base theme already supplies
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
