// Primary destinations shown in the desktop TopNav (see TopNav.tsx).
//
// A left sidebar was considered and rejected: two-three destinations would
// leave an empty rail, and the left edge is already used by per-section
// outline nav (see SectionNav's `outline` orientation). If the destination
// count grows enough to justify a sidebar later, this array is the swap
// point — read from here rather than duplicating the list.
import { useRpiIntegration } from '@/features/cameras/rpi/useRpiIntegration';

export type Destination = { key: string; label: string; href: '/products' | '/cameras' };

export const PRIMARY_DESTINATIONS: Destination[] = [
  { key: 'products', label: 'Products', href: '/products' },
  { key: 'cameras', label: 'Cameras', href: '/cameras' },
];

/**
 * PRIMARY_DESTINATIONS minus the ones the user's integrations switch off.
 * Lives here rather than in TopNav so the nav chrome stays a renderer and
 * doesn't reach into feature modules for routing policy.
 */
export function useVisibleDestinations(): Destination[] {
  const { enabled: rpiEnabled } = useRpiIntegration();
  return PRIMARY_DESTINATIONS.filter((destination) => destination.key !== 'cameras' || rpiEnabled);
}
