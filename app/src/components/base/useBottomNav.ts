import { usePathname } from 'expo-router';
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

export type TabHref = '/products' | '/cameras' | '/account';

export type Tab = {
  key: string;
  label: string;
  href: TabHref;
  icon: IconName;
};

export function useBottomNavTabs(): Tab[] {
  const { user } = useAuth();
  const destinations = useVisibleDestinations();
  return [
    ...destinations.map((d) => ({ ...d, icon: DESTINATION_ICONS[d.key] ?? 'package' })),
    ...(user
      ? [{ key: 'account', label: 'Account', href: '/account' as const, icon: 'user' as IconName }]
      : []),
  ];
}

/**
 * True exactly when `<BottomNav />` will render: phone-width (below lg,
 * always true on native) and pathname is one of its top-level tabs. Exported
 * as the single source of truth so callers that need to reserve space below
 * the bar (ActiveStreamBanner) key off the same computation instead of a
 * duplicated, driftable condition.
 */
export function useBottomNavVisible(): boolean {
  const { isLg } = useBreakpoint();
  const pathname = usePathname();
  const tabs = useBottomNavTabs();
  return !isLg && tabs.some((tab) => tab.href === pathname);
}
