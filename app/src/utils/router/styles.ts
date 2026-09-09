import type { AppTheme } from '@/theme';

export function getProductsHeaderStyle(theme: AppTheme) {
  return {
    // NOTE: 34 is iOS's large-title metric, not a ramp step.
    headerTitleStyle: {
      fontWeight: '700' as const,
      fontSize: 34,
      color: theme.colors.onBackground,
    },
    headerStyle: {
      backgroundColor: theme.colors.card,
    },
  };
}
