import { useSegments } from 'expo-router';
import { MIN_TAP_TARGET } from '@/constants';
import { useAuth } from '@/context/auth';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { useVisibleDestinations } from '@/navigation/destinations';
import type { IconName } from './Icon';

// Non-component module (not .tsx) so the Fast-Refresh-only-exports-components
// eslint rule doesn't apply — BottomNav.tsx stays component-only, this file
// carries the shared hooks/constants/types both it and ActiveStreamBanner need.

const DESTINATION_ICONS: Record<string, IconName> = {
  products: 'package',
  cameras: 'camera',
};

/**
 * Approximate rendered height of the bar itself (icon + label + the row's own
 * py-2 padding, which runs a little over MIN_TAP_TARGET) — NOT including the
 * device's safe-area bottom inset, which the bar also pads for but which
 * varies per device. Exported so other floating chrome (ActiveStreamBanner)
 * can clear the bar without hand-measuring or duplicating its layout. Good
 * enough for a floating-offset bump; swap for an onLayout measurement if a
 * pixel-perfect gap is ever needed.
 */
export const BOTTOM_NAV_CLEARANCE = MIN_TAP_TARGET + 16;

export type Tab = {
  key: string;
  label: string;
  icon: IconName;
};

/**
 * Route name of a destination's tab. Every tab is a group segment named after
 * its destination key — `(products)` holds both the /products and /components
 * trees, so the folder can't just be called `products` (see (tabs)/_layout.tsx).
 */
export function tabRouteName(key: string): string {
  return `(${key})`;
}

export function useBottomNavTabs(): Tab[] {
  const { user } = useAuth();
  const destinations = useVisibleDestinations();
  return [
    ...destinations.map(({ key, label }) => ({
      key,
      label,
      icon: DESTINATION_ICONS[key] ?? 'package',
    })),
    ...(user ? [{ key: 'account', label: 'Account', icon: 'user' as IconName }] : []),
  ];
}

/**
 * True exactly when `<BottomNav />` will render: phone-width (below lg, always
 * true on native) and the current route is inside the (tabs) group — which now
 * includes every tab's detail screens, not just the three tab roots. Exported
 * as the single source of truth so callers that need to reserve space below the
 * bar (ActiveStreamBanner, the FABs, SaveBar's web dock) key off the same
 * computation instead of a duplicated, driftable condition.
 */
export function useBottomNavVisible(): boolean {
  const { isLg } = useBreakpoint();
  const segments = useSegments();
  return !isLg && segments[0] === '(tabs)';
}
