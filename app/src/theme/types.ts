import type { ViewStyle } from 'react-native';

export type AppScheme = 'light' | 'dark';

export type AppColorScale = {
  primary: string;
  onPrimary: string;
  primaryContainer: string;
  onPrimaryContainer: string;
  secondary: string;
  secondaryContainer: string;
  onSecondaryContainer: string;
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
  shadow: string;
  scrim: string;
  inverseSurface: string;
  inverseOnSurface: string;
  elevation: {
    level1: string;
    level2: string;
    level4: string;
  };
};

export type AppTokens = {
  status: {
    success: string;
    warning: string;
    danger: string;
    info: string;
    offline: string;
    live: string;
    onStatus: string;
  };
  overlay: {
    page: string;
    /** Flat scrim for auth screens whose content sits on cards. */
    hero: string;
    /** Centre band of the hero gradient, behind the content column. */
    heroBand: string;
    /** Outer edges of the hero gradient, where the backdrop stays vivid. */
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
    inverseMuted: string;
    onMedia: string;
  };
  surface: {
    raised: string;
    sunken: string;
    accent: string;
    card: string;
  };
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
