import { StyleSheet } from 'react-native';
import type { AppTheme } from '@/theme';
import { alpha, memoizeByTheme } from '@/theme';

// Residue after the NativeWind convergence: everything with an exact class
// (layout, spacing, radius) moved to className at the call site. What's left
// is theme-dependent color (tokens.* / alpha() have no CSS var) that must
// stay in `style`.
export const createGalleryStyles = memoizeByTheme((theme: AppTheme) => {
  return StyleSheet.create({
    overlayIconButton: {
      backgroundColor: theme.tokens.overlay.media,
    },
    navButton: {
      backgroundColor: alpha(theme.colors.scrim, 0.35),
    },
    counterBadge: {
      backgroundColor: alpha(theme.colors.scrim, 0.6),
    },
    deleteButton: {
      backgroundColor: alpha(theme.tokens.status.danger, 0.8),
    },
    emptyActionCard: {
      backgroundColor: theme.tokens.surface.sunken,
      borderColor: theme.tokens.border.subtle,
    },
    emptyActionText: {
      color: theme.tokens.text.muted,
    },
  });
});
