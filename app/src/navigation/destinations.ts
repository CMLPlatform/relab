// Primary destinations shown in the desktop TopNav (see TopNav.tsx).
import { useServerPreferenceToggle } from '@/features/cameras/serverPreferenceToggle';

export type Destination = {
  key: string;
  label: string;
  href: '/products' | '/cameras';
  /** Other route trees this destination owns, for the active state. */
  alsoActiveUnder?: string[];
};

export const PRIMARY_DESTINATIONS: Destination[] = [
  // The products tab owns /components too (see (tabs)/_layout.tsx).
  { key: 'products', label: 'Products', href: '/products', alsoActiveUnder: ['/components'] },
  { key: 'cameras', label: 'Cameras', href: '/cameras' },
];

/** PRIMARY_DESTINATIONS minus the ones the user's integrations switch off. */
export function useVisibleDestinations(): Destination[] {
  const { enabled: rpiEnabled } = useServerPreferenceToggle('rpi_camera_enabled');
  return PRIMARY_DESTINATIONS.filter((destination) => destination.key !== 'cameras' || rpiEnabled);
}

/** True when `pathname` is the destination's route or sits under one of its trees. */
export function isDestinationActive(destination: Destination, pathname: string): boolean {
  return [destination.href, ...(destination.alsoActiveUnder ?? [])].some(
    (root) => pathname === root || pathname.startsWith(`${root}/`),
  );
}
