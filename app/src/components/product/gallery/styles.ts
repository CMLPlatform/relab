import { StyleSheet } from 'react-native';
import type { AppTheme } from '@/theme';
import { alpha, memoizeByTheme } from '@/theme';

// Theme-dependent color with no CSS var (tokens.* / alpha()) stays in `style`.
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
  });
});
