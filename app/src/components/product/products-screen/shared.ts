import { StyleSheet } from 'react-native';
import { getFloatingPosition } from '@/utils/platformLayout';

export const PAGE_SIZE = 24;

export const PRODUCTS_DATE_PRESETS = [
  { label: 'Last 7d', days: 7 },
  { label: 'Last 30d', days: 30 },
  { label: 'Last 90d', days: 90 },
] as const;

// Residue after the NativeWind convergence: everything with an exact class
// (layout, spacing, radius, var-backed color) moved to className at the call
// site. What's left needs JS because it targets a non-className-wrapped host
// (expo-image, LinearGradient), has no matching fontSize+lineHeight step, or
// (fab) is composed inside another component's own style function.
export const productsScreenStyles = StyleSheet.create({
  // fontSize 13 has no matching text-* step (text-xs is 12/16) — kept inline
  // rather than force a class that would change line height.
  errorMessage: {
    fontSize: 13,
  },
  // fontSize 14 with no lineHeight set — text-sm carries lineHeight 20 the
  // original never had, so it stays inline.
  paginationSummary: {
    fontSize: 14,
  },
  inlineButtonText: {
    fontSize: 14,
  },
  inlineProfileText: {
    fontSize: 14,
  },
  // expo-image's Image isn't a NativeWind className target — style only.
  welcomeBrandMark: {
    width: 30,
    height: 30,
  },
  // fontSize/lineHeight pair (19/24) has no matching text-* step.
  welcomeTitle: {
    fontSize: 19,
    lineHeight: 24,
  },
  // fontSize/lineHeight/opacity combo (14/21/0.92) has no matching step set.
  welcomeBodyText: {
    fontSize: 14,
    lineHeight: 21,
    opacity: 0.92,
  },
  // expo-image's Image isn't a NativeWind className target — style only.
  emptyStateMark: {
    width: 60,
    height: 60,
    opacity: 0.9,
    marginBottom: 12,
  },
  emptyStateText: {
    fontSize: 14,
    lineHeight: 21,
    opacity: 0.92,
  },
  // LinearGradient isn't a NativeWind className target — style only.
  headerFade: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 40,
    zIndex: 10,
    pointerEvents: 'none',
  },
  // Fab exposes only a `style` prop (composed inside its own pressableStyle
  // function, see Fab.tsx) — no className surface to target.
  fab: {
    position: getFloatingPosition(),
    right: 16,
    bottom: 16,
    zIndex: 31,
    margin: 0,
  },
});
