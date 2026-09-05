import { useMemo } from 'react';
import { useAppTheme } from './appThemeContext';

/**
 * The inverse-surface trio, as one value that cannot be mismatched.
 *
 * `inverseSurface` is the dark-on-light / light-on-dark ground used by
 * tooltips, toasts and the live-stream banner. Its text must be
 * `inverseOnSurface`, and its secondary text `tokens.text.inverseMuted` —
 * pairing either with a same-polarity surface inverts the contrast.
 *
 * That is not hypothetical. `ActiveStreamBanner` painted `inverseOnSurface` on
 * `tokens.surface.sunken` (same-polarity) and measured 1.32:1 in dark and
 * 1.16:1 in light: the product name was invisible in both schemes, and the
 * elapsed-time readout was invisible in one. DESIGN.md states the rule in
 * prose; four components implemented it independently and one got it wrong.
 *
 * Returning the ground and both inks together makes the correct pairing the
 * path of least resistance, without forcing a tooltip, a toast and a banner to
 * share a layout they have no reason to share.
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
