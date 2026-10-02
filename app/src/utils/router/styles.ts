import type { AppTheme } from '@/theme/types';

export function getProductsHeaderStyle(theme: AppTheme) {
  return {
    // NOTE: no size or weight here: the products header renders BrandHeaderTitle, so the
    // title text style only sets the ink of the fallback string.
    headerTitleStyle: {
      color: theme.colors.onBackground,
    },
    headerStyle: {
      backgroundColor: theme.colors.card,
    },
  };
}
