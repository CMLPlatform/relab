import type { MD3Theme } from 'react-native-paper';
import { alpha } from '@/theme/color';
import type { AppScheme, AppTokens } from '@/theme/types';

export const SEMANTIC_COLORS = {
  live: '#e53935',
  success: '#2e7d32',
  warning: '#f57c00',
  info: '#1976d2',
  offline: '#757575',
  link: '#1565C0',
} as const;

export function createTokens(scheme: AppScheme, colors: MD3Theme['colors']): AppTokens {
  const isDark = scheme === 'dark';

  return {
    status: {
      success: SEMANTIC_COLORS.success,
      warning: SEMANTIC_COLORS.warning,
      danger: colors.error,
      info: SEMANTIC_COLORS.info,
      offline: SEMANTIC_COLORS.offline,
      live: SEMANTIC_COLORS.live,
    },
    overlay: {
      page: isDark ? 'rgba(10,10,10,0.90)' : 'rgba(242,242,242,0.95)',
      scrim: isDark ? 'rgba(0,0,0,0.5)' : 'rgba(0,0,0,0.4)',
      media: 'rgba(0,0,0,0.5)',
      glass: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.07)',
    },
    border: {
      subtle: 'rgba(128,128,128,0.2)',
      strong: 'rgba(128,128,128,0.5)',
      selected: SEMANTIC_COLORS.info,
    },
    text: {
      link: SEMANTIC_COLORS.link,
      muted: isDark ? '#B7B7B7' : '#999999',
      inverseMuted: 'rgba(255,255,255,0.6)',
      // Always-light content for elements placed on overlay.media (a dark scrim),
      // regardless of app theme — the scrim is dark in both schemes.
      onMedia: '#fff',
    },
    surface: {
      raised: colors.elevation.level2,
      sunken: isDark ? '#1a1a1a' : colors.surfaceVariant,
      accent: alpha(colors.primary, 0.12),
    },
  };
}
