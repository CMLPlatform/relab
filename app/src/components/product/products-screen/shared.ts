import { StyleSheet } from 'react-native';
import { MIN_TAP_TARGET } from '@/constants';
import { getFloatingPosition } from '@/utils/platformLayout';

export const PRODUCTS_DATE_PRESETS = [
  { label: 'Last 7d', days: 7 },
  { label: 'Last 30d', days: 30 },
  { label: 'Last 90d', days: 90 },
] as const;

export const PRODUCTS_FAB_EDGE_GAP = 16;
export const PRODUCTS_LIST_FAB_CLEARANCE = MIN_TAP_TARGET + PRODUCTS_FAB_EDGE_GAP * 2;

// Residue after the NativeWind convergence: everything with an exact class
// (layout, spacing, radius, var-backed color) moved to className at the call
// site. What's left needs JS because it targets a non-className-wrapped host
// (expo-image, LinearGradient), has no matching fontSize+lineHeight step, or
// (fab) is composed inside another component's own style function.
export const productsScreenStyles = StyleSheet.create({
  // NOTE: the surrounding contrast comment (InlinePills.tsx) measures ratios
  // against an exact 14px bold — WCAG's "large text" threshold is 18.66px
  // bold, so swapping to the `data` ramp step (which also forces monospace)
  // would both change the type and invalidate the measured ratio.
  inlineButtonText: {
    fontSize: 14,
  },
  // NOTE: see inlineButtonText above — same 14px-bold contrast dependency.
  inlineProfileText: {
    fontSize: 14,
  },
  // expo-image's Image isn't a NativeWind className target — style only.
  welcomeBrandMark: {
    width: 30,
    height: 30,
  },
  // fontSize/lineHeight/opacity combo (14/21/0.92) has no matching step set.
  welcomeBodyText: {
    fontSize: 14,
    lineHeight: 21,
    opacity: 0.92,
  },
  // Animated.View isn't a reliable className target under react-native-css —
  // keep the fade wrapper's layout-neutral flex here as a plain style.
  listFadeWrapper: {
    flex: 1,
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
    right: PRODUCTS_FAB_EDGE_GAP,
    bottom: PRODUCTS_FAB_EDGE_GAP,
    zIndex: 31,
    margin: 0,
  },
});
