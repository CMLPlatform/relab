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
  // NOTE: InlinePills.tsx measures contrast against exactly 14px bold.
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
  // Animated.View is not a reliable className target.
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
  // Fab exposes only a `style` prop.
  fab: {
    position: getFloatingPosition(),
    right: PRODUCTS_FAB_EDGE_GAP,
    bottom: PRODUCTS_FAB_EDGE_GAP,
    zIndex: 31,
    margin: 0,
  },
});
