import type { Product } from '@/types/Product';

/**
 * Canonical minimal Product for use across test files.
 * Override only the fields relevant to the test under examination.
 */
export const baseProduct: Product = {
  id: 1,
  name: 'Recycled Aluminum Laptop Stand',
  componentIDs: [],
  physicalProperties: { weight: 850, width: 30, height: 12, depth: 25 },
  circularityProperties: {
    recyclabilityObservation: '',
    remanufacturabilityObservation: '',
    repairabilityObservation: '',
  },
  images: [],
  videos: [],
  ownedBy: 'me',
};
