import type { AppTheme } from '@/theme';

export function createHeaderRightPillStyles(theme: AppTheme) {
  return {
    pill: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 6,
      marginRight: 16,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 20,
      backgroundColor: theme.tokens.overlay.glass,
    },
    primaryText: {
      color: theme.colors.onBackground,
      fontWeight: '600' as const,
      fontSize: 14,
    },
  };
}

export function getProductsHeaderStyle(theme: AppTheme) {
  return {
    headerTitleStyle: {
      fontWeight: '700' as const,
      fontSize: 34,
      color: theme.colors.onBackground,
    },
    headerStyle: {
      backgroundColor: theme.tokens.surface.raised,
    },
  };
}
