import { StyleSheet } from 'react-native';
import { radius } from '@/constants';
import type { AppTheme } from '@/theme';
import { memoizeByTheme } from '@/theme';

// Only what has no className equivalent stays here.
export const createLivePreviewStyles = memoizeByTheme((theme: AppTheme) => {
  return StyleSheet.create({
    // expo-video's VideoView is not a className target.
    nativeVideo: {
      width: '100%',
      height: '100%',
      borderRadius: radius.card,
      backgroundColor: theme.colors.scrim,
    },
    // tokens.overlay.scrim has no CSS var, JS-only.
    overlay: {
      backgroundColor: theme.tokens.overlay.scrim,
    },
  });
});

/** Plain CSS for the DOM `<video>` element created with `createElement`. */
export const createWebVideoStyle = memoizeByTheme((theme: AppTheme) => ({
  width: '100%',
  height: '100%',
  borderRadius: radius.card,
  objectFit: 'contain' as const,
  backgroundColor: theme.colors.scrim,
}));
