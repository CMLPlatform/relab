import type { Product } from '@/types/Product';

/**
 * Canonical minimal Product for use across test files.
 * Override only the fields relevant to the test under examination.
 */
export const baseProduct: Product = {
  id: 1,
  role: 'product',
  name: 'Recycled Aluminum Laptop Stand',
  componentIDs: [],
  components: [],
  physicalProperties: { weight: 850, width: 30, height: 12, depth: 25 },
  circularityProperties: {
    recyclability: null,
    disassemblability: null,
    remanufacturability: null,
  },
  images: [],
  videos: [],
  ownedBy: 'me',
};
