import type { Product } from '@/types/Product';

/**
 * Canonical minimal Product for use across test files.
 * Override only the fields relevant to the test under examination.
 */
export const baseProduct: Product = {
  id: 1,
  name: 'Test Product',
  componentIDs: [],
  physicalProperties: { weight: 100, width: 10, height: 5, depth: 3 },
  circularityProperties: {
    recyclabilityObservation: '',
    remanufacturabilityObservation: '',
    repairabilityObservation: '',
  },
  images: [],
  videos: [],
  ownedBy: 'me',
};
