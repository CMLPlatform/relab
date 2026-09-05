import type { AppTheme } from '@/theme';

export function getProductsHeaderStyle(theme: AppTheme) {
  return {
    // NOTE: React Navigation's native Stack header title — a third-party
    // component's own style prop, not AppText. 34 matches iOS's large-title
    // metric (Apple HIG), not a ramp step.
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
