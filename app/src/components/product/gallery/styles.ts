import { StyleSheet } from 'react-native';
import { alpha } from '@/theme/color';
import { memoizeByTheme } from '@/theme/memoizeByTheme';
import { palette } from '@/theme/palette.generated';
import type { AppTheme } from '@/theme/types';

/**
 * Pressed and hovered fill for the glass buttons laid over a photo: a filled control, so
 * primary-strong (DESIGN.md, Press feedback). Light-scheme strong in both schemes, because the
 * media scrim and its white ink do not change with the scheme either.
 */
export const MEDIA_PRESSED_FILL = palette.light.primaryStrong;

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
