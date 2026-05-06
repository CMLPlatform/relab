import {
  DarkTheme as navigationDarkTheme,
  DefaultTheme as navigationLightTheme,
} from '@react-navigation/native';
import { adaptNavigationTheme, MD3DarkTheme, MD3LightTheme } from 'react-native-paper';
import { createTokens } from '@/theme/tokens';
import type { AppScheme, AppTheme } from '@/theme/types';

const FONT_FAMILY = {
  regular: 'IBMPlexSans-Regular',
  medium: 'IBMPlexSans-Medium',
  semiBold: 'IBMPlexSans-SemiBold',
  bold: 'IBMPlexSans-Bold',
} as const;

const FONT_WEIGHT = {
  regular: '400',
  medium: '500',
  semiBold: '600',
  bold: '700',
} as const;

type FontRole = keyof typeof FONT_FAMILY;
type ThemeFontVariant =
  | 'displayLarge'
  | 'displayMedium'
  | 'displaySmall'
  | 'headlineLarge'
  | 'headlineMedium'
  | 'headlineSmall'
  | 'titleLarge'
  | 'titleMedium'
  | 'titleSmall'
  | 'labelLarge'
  | 'labelMedium'
  | 'labelSmall'
  | 'bodyLarge'
  | 'bodyMedium'
  | 'bodySmall';

const FONT_VARIANT_ROLES: Array<readonly [readonly ThemeFontVariant[], FontRole]> = [
  [
    [
      'displayLarge',
      'displayMedium',
      'displaySmall',
      'headlineLarge',
      'headlineMedium',
      'headlineSmall',
      'titleLarge',
    ],
    'semiBold',
  ],
  [['titleMedium', 'titleSmall', 'labelLarge', 'labelMedium', 'labelSmall'], 'medium'],
  [['bodyLarge', 'bodyMedium', 'bodySmall'], 'regular'],
];

function withFont<T extends { fontFamily: string; fontWeight?: string }>(font: T, role: FontRole) {
  return {
    ...font,
    fontFamily: FONT_FAMILY[role],
    fontWeight: FONT_WEIGHT[role],
  };
}

function createThemeFonts(baseFonts: typeof MD3LightTheme.fonts) {
  const fonts = {
    ...baseFonts,
    default: withFont(baseFonts.default, 'regular'),
  };

  for (const [variants, role] of FONT_VARIANT_ROLES) {
    for (const variant of variants) {
      fonts[variant] = withFont(baseFonts[variant], role);
    }
  }

  return fonts;
}

function createThemeColors(isDark: boolean, baseColors: typeof MD3LightTheme.colors) {
  return {
    ...baseColors,
    primary: isDark ? 'rgb(99, 211, 255)' : 'rgb(0, 103, 131)',
    onPrimary: isDark ? 'rgb(0, 53, 69)' : 'rgb(255, 255, 255)',
    primaryContainer: isDark ? 'rgb(0, 77, 99)' : 'rgb(188, 233, 255)',
    onPrimaryContainer: isDark ? 'rgb(188, 233, 255)' : 'rgb(0, 31, 42)',
    secondary: isDark ? 'rgb(180, 202, 213)' : 'rgb(77, 97, 107)',
    onSecondary: isDark ? 'rgb(30, 51, 60)' : 'rgb(255, 255, 255)',
    secondaryContainer: isDark ? 'rgb(53, 74, 83)' : 'rgb(208, 230, 242)',
    onSecondaryContainer: isDark ? 'rgb(208, 230, 242)' : 'rgb(8, 30, 39)',
    tertiary: isDark ? 'rgb(197, 194, 234)' : 'rgb(92, 91, 125)',
    onTertiary: isDark ? 'rgb(46, 45, 77)' : 'rgb(255, 255, 255)',
    tertiaryContainer: isDark ? 'rgb(69, 67, 100)' : 'rgb(226, 223, 255)',
    onTertiaryContainer: isDark ? 'rgb(226, 223, 255)' : 'rgb(25, 24, 54)',
    error: isDark ? 'rgb(255, 180, 171)' : 'rgb(186, 26, 26)',
    onError: isDark ? 'rgb(105, 0, 5)' : 'rgb(255, 255, 255)',
    errorContainer: isDark ? 'rgb(147, 0, 10)' : 'rgb(255, 218, 214)',
    onErrorContainer: isDark ? 'rgb(255, 180, 171)' : 'rgb(65, 0, 2)',
    background: isDark ? 'rgb(25, 28, 30)' : 'rgb(251, 252, 254)',
    onBackground: isDark ? 'rgb(225, 226, 228)' : 'rgb(25, 28, 30)',
    surface: isDark ? 'rgb(25, 28, 30)' : 'rgb(251, 252, 254)',
    onSurface: isDark ? 'rgb(225, 226, 228)' : 'rgb(25, 28, 30)',
    surfaceVariant: isDark ? 'rgb(64, 72, 76)' : 'rgb(220, 228, 233)',
    onSurfaceVariant: isDark ? 'rgb(192, 200, 205)' : 'rgb(64, 72, 76)',
    outline: isDark ? 'rgb(138, 146, 151)' : 'rgb(112, 120, 125)',
    outlineVariant: isDark ? 'rgb(64, 72, 76)' : 'rgb(192, 200, 205)',
    shadow: 'rgb(0, 0, 0)',
    scrim: 'rgb(0, 0, 0)',
    inverseSurface: isDark ? 'rgb(225, 226, 228)' : 'rgb(46, 49, 50)',
    inverseOnSurface: isDark ? 'rgb(46, 49, 50)' : 'rgb(239, 241, 243)',
    inversePrimary: isDark ? 'rgb(0, 103, 131)' : 'rgb(99, 211, 255)',
    elevation: {
      level0: 'transparent',
      level1: isDark ? 'rgb(29, 37, 41)' : 'rgb(238, 245, 248)',
      level2: isDark ? 'rgb(31, 43, 48)' : 'rgb(231, 240, 244)',
      level3: isDark ? 'rgb(33, 48, 55)' : 'rgb(223, 236, 241)',
      level4: isDark ? 'rgb(34, 50, 57)' : 'rgb(221, 234, 239)',
      level5: isDark ? 'rgb(35, 54, 62)' : 'rgb(216, 231, 237)',
    },
    surfaceDisabled: isDark ? 'rgba(225, 226, 228, 0.12)' : 'rgba(25, 28, 30, 0.12)',
    onSurfaceDisabled: isDark ? 'rgba(225, 226, 228, 0.38)' : 'rgba(25, 28, 30, 0.38)',
    backdrop: 'rgba(42, 50, 53, 0.4)',
  };
}

function createTheme(
  baseTheme: typeof MD3LightTheme | typeof MD3DarkTheme,
  scheme: AppScheme,
): AppTheme {
  const isDark = scheme === 'dark';
  const colors = createThemeColors(isDark, baseTheme.colors);
  return {
    ...baseTheme,
    colors,
    roundness: 1,
    dark: isDark,
    fonts: createThemeFonts(baseTheme.fonts),
    scheme,
    isDark,
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
    reactNavigationLight: navigationLightTheme,
    reactNavigationDark: navigationDarkTheme,
    materialLight: lightTheme,
    materialDark: darkTheme,
  });

  LightTheme.colors.background = 'transparent';
  DarkTheme.colors.background = 'transparent';

  return { LightTheme, DarkTheme };
}
