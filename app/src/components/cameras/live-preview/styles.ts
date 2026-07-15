import { StyleSheet } from 'react-native';
import type { AppTheme } from '@/theme';
import { memoizeByTheme } from '@/theme';

export const createLivePreviewStyles = memoizeByTheme((theme: AppTheme) => {
  return StyleSheet.create({
    card: {
      marginHorizontal: 16,
      marginTop: 12,
    },
    // Base Card has no built-in content padding (unlike Paper's Card.Content,
    // which defaulted to padding: 16) — added explicitly here.
    content: {
      padding: 16,
      alignItems: 'center',
      gap: 8,
    },
    videoFrame: {
      width: '100%',
      aspectRatio: 4 / 3,
      position: 'relative',
    },
    nativeVideo: {
      width: '100%',
      height: '100%',
      borderRadius: 8,
      backgroundColor: theme.colors.scrim,
    },
    overlay: {
      ...StyleSheet.absoluteFill,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      backgroundColor: theme.tokens.overlay.scrim,
    },
    overlayText: {
      color: theme.colors.onPrimary,
      textAlign: 'center',
    },
    caption: {
      color: theme.tokens.text.muted,
    },
    retryText: {
      color: theme.colors.onPrimary,
      textDecorationLine: 'underline',
      marginTop: 4,
    },
  });
});

/**
 * Plain CSS for the DOM `<video>` element — not a React Native style, since
 * `objectFit` is web-only and the element is created with `createElement`.
 */
export const createWebVideoStyle = memoizeByTheme((theme: AppTheme) => ({
  width: '100%',
  height: '100%',
  borderRadius: 8,
  objectFit: 'contain' as const,
  backgroundColor: theme.colors.scrim,
}));
