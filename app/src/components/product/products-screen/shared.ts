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

// Only what has no className equivalent stays here.
export const productsScreenStyles = StyleSheet.create({
  inlineButtonText: {
    // NOTE: InlinePills.tsx measures contrast against exactly 14px bold; no sans step is 14.
    fontSize: 14,
  },
  inlineProfileText: {
    // NOTE: see inlineButtonText above — same 14px-bold contrast dependency.
    fontSize: 14,
  },
  // expo-image's Image isn't a NativeWind className target — style only.
  welcomeBrandMark: {
    width: 30,
    height: 30,
  },
  welcomeBodyText: {
    // NOTE: 14/21 sits between caption (13/18) and body (16/26); neither fits the welcome card.
    fontSize: 14,
    lineHeight: 21,
    opacity: 0.92,
  },
  // Animated.View is not a reliable className target.
  listFadeWrapper: {
    flex: 1,
  },
  // expo-image's Image isn't a NativeWind className target — style only.
  // Wordmark aspect (759x240), same height as the old mark.
  emptyStateMark: {
    width: 190,
    height: 60,
    opacity: 0.9,
    marginBottom: 12,
  },
  emptyStateText: {
    // NOTE: same 14/21 as welcomeBodyText, see above.
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
  // Fab exposes only a `style` prop.
  fab: {
    position: getFloatingPosition(),
    right: PRODUCTS_FAB_EDGE_GAP,
    bottom: PRODUCTS_FAB_EDGE_GAP,
    zIndex: 31,
    margin: 0,
  },
});
