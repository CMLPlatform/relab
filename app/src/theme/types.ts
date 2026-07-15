export type AppScheme = 'light' | 'dark';

type FontVariant = {
  fontFamily: string | undefined;
  letterSpacing: number;
  fontWeight: string;
  lineHeight: number;
  fontSize: number;
};

export type AppFonts = {
  displayLarge: FontVariant;
  displayMedium: FontVariant;
  displaySmall: FontVariant;
  headlineLarge: FontVariant;
  headlineMedium: FontVariant;
  headlineSmall: FontVariant;
  titleLarge: FontVariant;
  titleMedium: FontVariant;
  titleSmall: FontVariant;
  labelLarge: FontVariant;
  labelMedium: FontVariant;
  labelSmall: FontVariant;
  bodyLarge: FontVariant;
  bodyMedium: FontVariant;
  bodySmall: FontVariant;
};

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
    hero: string;
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
  fonts: AppFonts;
  dark: boolean;
  scheme: AppScheme;
  tokens: AppTokens;
}

export type AppColors = AppTheme['colors'];
