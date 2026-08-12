import { Platform } from 'react-native';
import { alpha } from './color';
import { designTokens } from './tokens.generated';
import type { AppColorScale, AppScheme, AppTokens } from './types';

const SEMANTIC_COLORS = {
  light: {
    live: '#8F6212', // manila — DESIGN.md assigns live indicators to the accent
    success: '#2E7D32',
    warning: '#A05A00',
    info: '#1565C0',
    offline: '#5A6675',
    link: '#1565C0',
    onStatus: '#FFFFFF',
  },
  dark: {
    live: '#E3B95C',
    success: '#7BC67E',
    warning: '#FFB74D',
    info: '#90CAF9',
    offline: '#9E9E9E',
    link: '#8FB8FF', // = dark primary; blue-primary apps read links as primary actions
    onStatus: '#11141D',
  },
} as const;

export function createTokens(scheme: AppScheme, colors: AppColorScale): AppTokens {
  const isDark = scheme === 'dark';
  const semantic = SEMANTIC_COLORS[scheme];

  return {
    status: {
      success: semantic.success,
      warning: semantic.warning,
      danger: colors.error,
      info: semantic.info,
      offline: semantic.offline,
      live: semantic.live,
      onStatus: semantic.onStatus,
    },
    overlay: {
      page: isDark ? 'rgba(10,10,10,0.90)' : 'rgba(242,242,242,0.95)',
      // Flat scrim for auth screens whose content all sits on cards: the cards
      // carry legibility, so this only knocks the photo back a touch.
      hero: isDark ? 'rgba(12,14,20,0.50)' : 'rgba(250,251,254,0.50)',
      // Screens with content bare on the photo (the login mark, the new-account
      // headline) get a horizontal gradient instead: `heroBand` behind the
      // centred column, fading to `heroEdge` at the sides so the backdrop still
      // reads as a photo. Tinted to the theme background — dark in dark mode,
      // not a light film that would wash the photo the wrong way.
      heroBand: isDark ? 'rgba(12,14,20,0.82)' : 'rgba(250,251,254,0.78)',
      heroEdge: isDark ? 'rgba(12,14,20,0.22)' : 'rgba(250,251,254,0.18)',
      scrim: isDark ? 'rgba(0,0,0,0.55)' : 'rgba(12,18,32,0.50)',
      media: 'rgba(0,0,0,0.5)',
      glass: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.07)',
    },
    elevation: {
      overlay: isDark
        ? {
            shadowColor: '#000',
            shadowOpacity: 0.55,
            shadowRadius: 24,
            shadowOffset: { width: 0, height: 8 },
            elevation: 12,
          }
        : {
            shadowColor: 'rgba(20,40,80,1)',
            shadowOpacity: 0.16,
            shadowRadius: 24,
            shadowOffset: { width: 0, height: 8 },
            elevation: 8,
          },
    },
    border: {
      subtle: 'rgba(128,128,128,0.2)',
      strong: 'rgba(128,128,128,0.5)',
      selected: semantic.info,
    },
    text: {
      link: semantic.link,
      inverseMuted: 'rgba(255,255,255,0.6)',
      // Always-light content for elements placed on overlay.media (a dark scrim),
      // regardless of app theme — the scrim is dark in both schemes.
      onMedia: '#fff',
    },
    surface: {
      raised: colors.elevation.level2,
      sunken: isDark ? '#1a1a1a' : colors.surfaceVariant,
      accent: alpha(colors.primary, 0.12),
      // Translucent panel behind auth controls: opaque enough to keep labels
      // legible over a photo while a hint of the image still shows through.
      card: alpha(colors.surface, 0.8),
    },
    type: {
      display: {
        fontSize: designTokens.type.display.size,
        lineHeight: designTokens.type.display.line,
      },
      title: { fontSize: designTokens.type.title.size, lineHeight: designTokens.type.title.line },
      body: { fontSize: designTokens.type.body.size, lineHeight: designTokens.type.body.line },
      label: {
        fontSize: designTokens.type.label.size,
        lineHeight: designTokens.type.label.line,
        letterSpacing: designTokens.type.label.size * designTokens.type.label.trackingEm,
      },
      data: {
        fontSize: designTokens.type.data.size,
        lineHeight: designTokens.type.data.line,
        fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
        fontVariant: ['tabular-nums'] as const,
      },
    },
  };
}
