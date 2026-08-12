import type { AppTheme } from '@/theme';

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
