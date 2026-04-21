import {
  adaptNavigationTheme,
  MD3DarkTheme,
  MD3LightTheme,
  useTheme as usePaperTheme,
} from 'react-native-paper';
import { DarkTheme as navigationDarkTheme, DefaultTheme as navigationLightTheme } from '@react-navigation/native';

export type AppScheme = 'light' | 'dark';

export type AppTokens = {
  status: {
    success: string;
    warning: string;
    danger: string;
    info: string;
    offline: string;
    live: string;
  };
  overlay: {
    page: string;
    scrim: string;
    media: string;
    glass: string;
  };
  border: {
    subtle: string;
    strong: string;
    selected: string;
  };
  text: {
    link: string;
    muted: string;
    inverseMuted: string;
  };
  surface: {
    raised: string;
    sunken: string;
    accent: string;
  };
};

export type AppTheme = typeof MD3LightTheme & {
  dark: boolean;
  scheme: AppScheme;
  isDark: boolean;
  tokens: AppTokens;
};

export type AppColors = AppTheme['colors'];

function alpha(color: string, opacity: number) {
  if (color.startsWith('rgb(')) {
    return color.replace('rgb(', 'rgba(').replace(')', `, ${opacity})`);
  }
  if (color.startsWith('rgba(')) {
    return color.replace(/rgba\((.+),\s*[^,]+\)$/, `rgba($1, ${opacity})`);
  }
  if (color.startsWith('#')) {
    const hex = color.slice(1);
    const normalized =
      hex.length === 3
        ? hex
            .split('')
            .map((char) => `${char}${char}`)
            .join('')
        : hex.slice(0, 6);
    const int = Number.parseInt(normalized, 16);
    const r = (int >> 16) & 255;
    const g = (int >> 8) & 255;
    const b = int & 255;
    return `rgba(${r}, ${g}, ${b}, ${opacity})`;
  }
  return color;
}

function createTokens(scheme: AppScheme, colors: typeof MD3LightTheme.colors): AppTokens {
  const isDark = scheme === 'dark';
  const live = '#e53935';
  const success = '#2e7d32';
  const warning = '#f57c00';
  const info = '#1976d2';
  const offline = '#757575';
  const link = '#1565C0';

  return {
    status: {
      success,
      warning,
      danger: colors.error,
      info,
      offline,
      live,
    },
    overlay: {
      page: isDark ? 'rgba(10,10,10,0.90)' : 'rgba(242,242,242,0.95)',
      scrim: isDark ? 'rgba(0,0,0,0.5)' : 'rgba(0,0,0,0.4)',
      media: 'rgba(0,0,0,0.5)',
      glass: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.07)',
    },
    border: {
      subtle: isDark ? 'rgba(128,128,128,0.2)' : 'rgba(128,128,128,0.2)',
      strong: isDark ? 'rgba(128,128,128,0.5)' : 'rgba(128,128,128,0.5)',
      selected: info,
    },
    text: {
      link,
      muted: isDark ? '#B7B7B7' : '#999999',
      inverseMuted: 'rgba(255,255,255,0.6)',
    },
    surface: {
      raised: colors.elevation.level2,
      sunken: isDark ? '#1a1a1a' : colors.surfaceVariant,
      accent: alpha(colors.primary, 0.12),
    },
  };
}

function createTheme(baseTheme: typeof MD3LightTheme | typeof MD3DarkTheme, scheme: AppScheme): AppTheme {
  const isDark = scheme === 'dark';
  const themeColors = {
    ...baseTheme.colors,
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

  return {
    ...baseTheme,
    colors: themeColors,
    roundness: 1,
    dark: isDark,
    scheme,
    isDark,
    tokens: createTokens(scheme, themeColors),
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

export function useAppTheme() {
  return usePaperTheme<AppTheme>();
}

export function getStatusColor(theme: AppTheme, status: 'online' | 'offline' | 'unauthorized' | 'forbidden' | 'error') {
  switch (status) {
    case 'online':
      return theme.tokens.status.success;
    case 'offline':
      return theme.tokens.status.offline;
    case 'unauthorized':
    case 'forbidden':
      return theme.tokens.status.warning;
    case 'error':
      return theme.tokens.status.danger;
  }
}

export function getStatusTone(theme: AppTheme, color: string, opacity = 0.12) {
  return alpha(color, opacity);
}
