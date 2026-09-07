import { useSegments } from 'expo-router';
import { MIN_TAP_TARGET } from '@/constants';
import { useAuth } from '@/context/auth';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { useVisibleDestinations } from '@/navigation/destinations';
import type { IconName } from './Icon';

// Non-component module so react-refresh/only-export-components does not apply.

const DESTINATION_ICONS: Record<string, IconName> = {
  products: 'package',
  cameras: 'camera',
};

/**
 * Approximate rendered height of the bar (icon + label + py-2), excluding the
 * safe-area bottom inset. Used by floating chrome (ActiveStreamBanner) to clear it.
 */
export const BOTTOM_NAV_CLEARANCE = MIN_TAP_TARGET + 16;

export type Tab = {
  key: string;
  label: string;
  icon: IconName;
};

/** Route name of a destination's tab: the group segment named after its key. */
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
 * True exactly when `<BottomNav />` renders: below lg (always on native) and
 * inside the (tabs) group. Floating chrome (ActiveStreamBanner, FABs, SaveBar's
 * web dock) keys off this.
 */
export function useBottomNavVisible(): boolean {
  const { isLg } = useBreakpoint();
  const segments = useSegments();
  return !isLg && segments[0] === '(tabs)';
}
