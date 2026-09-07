import { useMemo } from 'react';
import { useAppTheme } from './appThemeContext';

/**
 * The inverse-surface trio as one value (Inverse-Pair Rule, DESIGN.md):
 * `inverseSurface` with `inverseOnSurface` and `tokens.text.inverseMuted`.
 * Pairing either ink with a same-polarity surface makes the text invisible.
 */
export function useInverseSurface() {
  const theme = useAppTheme();
  return useMemo(
    () => ({
      /** Ground. Always the backgroundColor of the surface. */
      background: theme.colors.inverseSurface,
      /** Primary text on that ground. */
      foreground: theme.colors.inverseOnSurface,
      /** Secondary text on that ground (scheme-aware alpha). */
      muted: theme.tokens.text.inverseMuted,
    }),
    [theme],
  );
}
