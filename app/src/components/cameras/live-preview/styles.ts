import { StyleSheet } from 'react-native';
import type { AppTheme } from '@/theme';

export function createLivePreviewStyles(theme: AppTheme) {
  return StyleSheet.create({
    card: {
      marginHorizontal: 16,
      marginTop: 12,
    },
    content: {
      alignItems: 'center',
      gap: 8,
    },
    videoFrame: {
      width: '100%',
      aspectRatio: 4 / 3,
      position: 'relative',
    },
    overlay: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
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
}
