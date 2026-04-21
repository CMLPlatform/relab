import type { MD3Theme } from 'react-native-paper';

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

export type AppTheme = MD3Theme & {
  dark: boolean;
  scheme: AppScheme;
  isDark: boolean;
  tokens: AppTokens;
};

export type AppColors = AppTheme['colors'];
