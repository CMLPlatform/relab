// Primary destinations shown in the desktop TopNav (see TopNav.tsx).
import { useRpiIntegration } from '@/features/cameras/rpi/useRpiIntegration';

export type Destination = { key: string; label: string; href: '/products' | '/cameras' };

export const PRIMARY_DESTINATIONS: Destination[] = [
  { key: 'products', label: 'Products', href: '/products' },
  { key: 'cameras', label: 'Cameras', href: '/cameras' },
];

/** PRIMARY_DESTINATIONS minus the ones the user's integrations switch off. */
export function useVisibleDestinations(): Destination[] {
  const { enabled: rpiEnabled } = useRpiIntegration();
  return PRIMARY_DESTINATIONS.filter((destination) => destination.key !== 'cameras' || rpiEnabled);
}
