import { radius } from '@/constants';
import type { AppTheme } from '@/theme';
import { memoizeByTheme } from '@/theme';

export const createHeaderRightPillStyles = memoizeByTheme((theme: AppTheme) => {
  return {
    pill: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 6,
      marginRight: 16,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: radius.control,
      // Interactive header control — primary family, never the neutral glass
      // (DESIGN.md: primary blue carries all interaction).
      backgroundColor: theme.colors.primaryContainer,
    },
    primaryText: {
      color: theme.colors.onPrimaryContainer,
      fontWeight: '600' as const,
      fontSize: 14,
    },
  };
});

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
