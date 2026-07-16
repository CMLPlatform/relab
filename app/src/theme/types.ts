import type { ViewStyle } from 'react-native';

export type AppScheme = 'light' | 'dark';

export type AppColorScale = {
  primary: string;
  onPrimary: string;
  primaryContainer: string;
  onPrimaryContainer: string;
  secondary: string;
  onSecondary: string;
  secondaryContainer: string;
  onSecondaryContainer: string;
  tertiary: string;
  onTertiary: string;
  tertiaryContainer: string;
  onTertiaryContainer: string;
  error: string;
  onError: string;
  errorContainer: string;
  onErrorContainer: string;
  background: string;
  onBackground: string;
  surface: string;
  onSurface: string;
  surfaceVariant: string;
  onSurfaceVariant: string;
  outline: string;
  outlineVariant: string;
  shadow: string;
  scrim: string;
  inverseSurface: string;
  inverseOnSurface: string;
  inversePrimary: string;
  elevation: {
    level0: string;
    level1: string;
    level2: string;
    level3: string;
    level4: string;
    level5: string;
  };
  surfaceDisabled: string;
  onSurfaceDisabled: string;
  backdrop: string;
};

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
    /** Centre band of the hero scrim, behind the content column. */
    hero: string;
    /** Outer edges of the hero scrim, where the backdrop stays vivid. */
    heroEdge: string;
    scrim: string;
    media: string;
    glass: string;
  };
  elevation: {
    overlay: ViewStyle;
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
    onMedia: string;
  };
  surface: {
    raised: string;
    sunken: string;
    accent: string;
    card: string;
  };
  spacing: { xs: number; sm: number; md: number; lg: number; xl: number };
  type: {
    display: { fontSize: number; lineHeight: number };
    title: { fontSize: number; lineHeight: number };
    body: { fontSize: number; lineHeight: number };
    label: { fontSize: number; lineHeight: number; letterSpacing: number };
    data: {
      fontSize: number;
      lineHeight: number;
      fontFamily: string;
      fontVariant: readonly ['tabular-nums'];
    };
  };
};

export interface AppTheme {
  colors: AppColorScale;
  dark: boolean;
  scheme: AppScheme;
  tokens: AppTokens;
}

export type AppColors = AppTheme['colors'];
