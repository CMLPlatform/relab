import { StyleSheet } from 'react-native';
import { radius } from '@/constants';
import type { AppTheme } from '@/theme';
import { memoizeByTheme } from '@/theme';

// Residue after the NativeWind convergence: layout moved to className at the
// call site; what's left is JS-only theme values (no CSS var) or targets a
// component that isn't className-wrapped.
export const createLivePreviewStyles = memoizeByTheme((theme: AppTheme) => {
  return StyleSheet.create({
    // expo-video's VideoView isn't a NativeWind className target, so
    // sizing stays inline too (its parent View owns the aspect-ratio box).
    nativeVideo: {
      width: '100%',
      height: '100%',
      borderRadius: radius.card,
      backgroundColor: theme.colors.scrim,
    },
    // tokens.overlay.scrim has no CSS var — JS-only.
    overlay: {
      backgroundColor: theme.tokens.overlay.scrim,
    },
    // tokens.text.muted has no CSS var — JS-only.
    caption: {
      color: theme.tokens.text.muted,
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
  borderRadius: radius.card,
  objectFit: 'contain' as const,
  backgroundColor: theme.colors.scrim,
}));
