// Primary destinations shown in the desktop TopNav (see TopNav.tsx).
//
// A left sidebar was considered and rejected: two-three destinations would
// leave an empty rail, and the left edge is already used by per-section
// outline nav (see SectionNav's `outline` orientation). If the destination
// count grows enough to justify a sidebar later, this array is the swap
// point — read from here rather than duplicating the list.
export type Destination = { key: string; label: string; href: '/products' | '/cameras' };

export const PRIMARY_DESTINATIONS: Destination[] = [
  { key: 'products', label: 'Products', href: '/products' },
  { key: 'cameras', label: 'Cameras', href: '/cameras' },
];
