// Type-only import (erased at build, so it does not trip expo-router's runtime
// react-navigation guard): react-native-paper's adaptNavigationTheme is typed against
// react-navigation's Theme, while expo-router re-exports the same objects under its own type.
import type { Theme } from '@react-navigation/native';
import {
  DarkTheme as navigationDarkTheme,
  DefaultTheme as navigationLightTheme,
} from 'expo-router';
import {
  adaptNavigationTheme,
  configureFonts,
  MD3DarkTheme,
  MD3LightTheme,
  useTheme as usePaperTheme,
} from 'react-native-paper';
import { createTokens } from './tokens';
import type { AppScheme, AppTheme } from './types';

export function useAppTheme() {
  return usePaperTheme<AppTheme>();
}

function createThemeColors(isDark: boolean, baseColors: typeof MD3LightTheme.colors) {
  return {
    ...baseColors,
    primary: isDark ? 'rgb(143, 184, 255)' : 'rgb(31, 76, 150)',
    onPrimary: isDark ? 'rgb(10, 31, 64)' : 'rgb(255, 255, 255)',
    primaryContainer: isDark ? 'rgb(20, 53, 103)' : 'rgb(216, 226, 255)',
    onPrimaryContainer: isDark ? 'rgb(216, 226, 255)' : 'rgb(0, 26, 65)',
    secondary: isDark ? 'rgb(190, 198, 220)' : 'rgb(86, 94, 113)',
    onSecondary: isDark ? 'rgb(40, 49, 65)' : 'rgb(255, 255, 255)',
    secondaryContainer: isDark ? 'rgb(62, 71, 89)' : 'rgb(218, 226, 249)',
    onSecondaryContainer: isDark ? 'rgb(218, 226, 249)' : 'rgb(19, 28, 43)',
    tertiary: isDark ? 'rgb(227, 185, 92)' : 'rgb(143, 98, 18)',
    onTertiary: isDark ? 'rgb(63, 46, 0)' : 'rgb(255, 255, 255)',
    tertiaryContainer: isDark ? 'rgb(91, 67, 0)' : 'rgb(255, 223, 158)',
    onTertiaryContainer: isDark ? 'rgb(255, 223, 158)' : 'rgb(42, 31, 0)',
    error: isDark ? 'rgb(255, 180, 171)' : 'rgb(186, 26, 26)',
    onError: isDark ? 'rgb(105, 0, 5)' : 'rgb(255, 255, 255)',
    errorContainer: isDark ? 'rgb(147, 0, 10)' : 'rgb(255, 218, 214)',
    onErrorContainer: isDark ? 'rgb(255, 180, 171)' : 'rgb(65, 0, 2)',
    background: isDark ? 'rgb(17, 20, 29)' : 'rgb(250, 251, 254)',
    onBackground: isDark ? 'rgb(226, 230, 238)' : 'rgb(22, 32, 46)',
    surface: isDark ? 'rgb(17, 20, 29)' : 'rgb(250, 251, 254)',
    onSurface: isDark ? 'rgb(226, 230, 238)' : 'rgb(22, 32, 46)',
    surfaceVariant: isDark ? 'rgb(68, 71, 79)' : 'rgb(224, 226, 236)',
    onSurfaceVariant: isDark ? 'rgb(196, 198, 208)' : 'rgb(68, 71, 79)',
    outline: isDark ? 'rgb(142, 144, 153)' : 'rgb(116, 119, 127)',
    outlineVariant: isDark ? 'rgb(68, 71, 79)' : 'rgb(196, 198, 208)',
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

// Brand type scale (assets/DESIGN.md) over the MD3 defaults; the app stays on
// platform system fonts, only sizes/tracking shift. Digits that must align
// keep using per-component `fontVariant: ['tabular-nums']`.
const fonts = configureFonts({
  config: {
    displaySmall: { fontSize: 38, lineHeight: 44 },
    headlineSmall: { fontSize: 24, lineHeight: 30 },
    bodyLarge: { lineHeight: 26 },
    labelMedium: { fontSize: 13, lineHeight: 18, letterSpacing: 1.3 },
  },
});

function createTheme(
  baseTheme: typeof MD3LightTheme | typeof MD3DarkTheme,
  scheme: AppScheme,
): AppTheme {
  const isDark = scheme === 'dark';
  const colors = createThemeColors(isDark, baseTheme.colors);
  return {
    ...baseTheme,
    colors,
    fonts,
    roundness: 1,
    dark: isDark,
    scheme,
    tokens: createTokens(scheme, colors),
  };
}

export const lightTheme = createTheme(MD3LightTheme, 'light');
export const darkTheme = createTheme(MD3DarkTheme, 'dark');

export function getAppTheme(scheme: AppScheme) {
  return scheme === 'dark' ? darkTheme : lightTheme;
}

export function createNavigationThemes() {
  const { LightTheme, DarkTheme } = adaptNavigationTheme({
    reactNavigationLight: navigationLightTheme as Theme,
    reactNavigationDark: navigationDarkTheme as Theme,
    materialLight: lightTheme,
    materialDark: darkTheme,
  });

  LightTheme.colors.background = 'transparent';
  DarkTheme.colors.background = 'transparent';

  return { LightTheme, DarkTheme };
}
