import { StyleSheet } from 'react-native';
import type { AppTheme } from '@/theme';
import { alpha } from '@/theme';

export function createGalleryStyles(theme: AppTheme) {
  return StyleSheet.create({
    galleryContainer: {
      position: 'relative',
    },
    overlayActionRow: {
      position: 'absolute',
      top: 12,
      left: 12,
      flexDirection: 'row',
      gap: 8,
    },
    overlayIconButton: {
      backgroundColor: theme.tokens.overlay.media,
      width: 36,
      height: 36,
      borderRadius: 18,
      justifyContent: 'center',
      alignItems: 'center',
    },
    navButton: {
      position: 'absolute',
      top: '50%',
      marginTop: -22,
      width: 44,
      height: 44,
      borderRadius: 22,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: alpha(theme.colors.scrim, 0.35),
    },
    counterBadge: {
      position: 'absolute',
      bottom: 12,
      right: 12,
      backgroundColor: alpha(theme.colors.scrim, 0.6),
      paddingHorizontal: 12,
      paddingVertical: 4,
      borderRadius: 16,
    },
    deleteButton: {
      position: 'absolute',
      top: 12,
      right: 12,
      backgroundColor: alpha(theme.tokens.status.danger, 0.8),
      width: 36,
      height: 36,
      borderRadius: 18,
      justifyContent: 'center',
      alignItems: 'center',
    },
    emptyStateRow: {
      flexDirection: 'row',
      gap: 12,
      height: 300,
    },
    emptyActionCard: {
      flex: 1,
      backgroundColor: theme.tokens.surface.sunken,
      justifyContent: 'center',
      alignItems: 'center',
      borderRadius: 8,
      borderWidth: 2,
      borderColor: theme.tokens.border.subtle,
      borderStyle: 'dashed',
    },
    emptyActionText: {
      color: theme.tokens.text.muted,
      marginTop: 8,
    },
    thumbnailContainer: {
      marginTop: 12,
      paddingHorizontal: 16,
    },
    thumbnailItem: {
      marginRight: 8,
      borderRadius: 6,
      overflow: 'hidden',
      borderWidth: 2,
    },
    previewDialog: {
      maxWidth: 600,
      alignSelf: 'center',
      width: '100%',
    },
    previewDialogContent: {
      alignItems: 'center',
      gap: 12,
    },
  });
}
