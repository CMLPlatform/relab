import type { SectionKey } from '@/components/base/SectionNavContext';
import type { Product } from '@/types/Product';

/** Where a checklist item scrolls to. 'gallery' has no Section wrapper, so it scrolls to the page top. */
export type MissingFieldTarget = SectionKey | 'gallery';

export type MissingField = {
  id: string;
  label: string;
  target: MissingFieldTarget;
  missing: (product: Product) => boolean;
};

const WEIGHT: MissingField = {
  id: 'weight',
  label: 'weight',
  target: 'properties',
  missing: (p) => !p.physicalProperties?.weight,
};
const PHOTO: MissingField = {
  id: 'photo',
  label: 'a photo',
  target: 'gallery',
  missing: (p) => (p.images?.length ?? 0) === 0,
};

const BASE_FIELDS: MissingField[] = [
  {
    id: 'productType',
    label: 'product type',
    target: 'overview',
    missing: (p) => p.productTypeID === undefined && !p.productTypeName,
  },
  { id: 'brand', label: 'brand', target: 'overview', missing: (p) => !p.brand?.trim() },
  WEIGHT,
  {
    id: 'dimensions',
    label: 'dimensions',
    target: 'properties',
    missing: (p) => {
      const { width, height, depth } = p.physicalProperties ?? {};
      return !(width || height || depth);
    },
  },
  PHOTO,
  {
    id: 'description',
    label: 'description',
    target: 'overview',
    missing: (p) => !p.description?.trim(),
  },
];

const COMPONENT_FIELDS: MissingField[] = [WEIGHT, PHOTO];

/**
 * Missing-data checklist for the completeness indicator. Components (role
 * 'component') only need weight and a photo; model number, videos, research
 * files, circularity properties, components and the bill of materials are
 * never counted.
 */
export function missingFields(product: Product): MissingField[] {
  const fields = product.role === 'component' ? COMPONENT_FIELDS : BASE_FIELDS;
  return fields.filter((field) => field.missing(product));
}
