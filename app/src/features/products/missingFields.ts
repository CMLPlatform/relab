import type { SectionKey } from '@/components/base/SectionNavContext';
import type { Product } from '@/types/Product';

/** Where a checklist item scrolls to. 'gallery' has no Section wrapper, so it scrolls to the page top. */
export type MissingFieldTarget = SectionKey | 'gallery';

export type MissingField = {
  id: string;
  label: string;
  target: MissingFieldTarget;
};

const BASE_FIELDS: MissingField[] = [
  { id: 'productType', label: 'product type', target: 'overview' },
  { id: 'brand', label: 'brand', target: 'overview' },
  { id: 'weight', label: 'weight', target: 'properties' },
  { id: 'dimensions', label: 'dimensions', target: 'properties' },
  { id: 'photo', label: 'a photo', target: 'gallery' },
  { id: 'description', label: 'description', target: 'overview' },
];

const COMPONENT_FIELDS: MissingField[] = [
  { id: 'weight', label: 'weight', target: 'properties' },
  { id: 'photo', label: 'a photo', target: 'gallery' },
];

function isMissing(id: MissingField['id'], product: Product): boolean {
  const { weight, width, height, depth } = product.physicalProperties ?? {};
  switch (id) {
    case 'productType':
      return product.productTypeID === undefined && !product.productTypeName;
    case 'brand':
      return !product.brand?.trim();
    case 'weight':
      return !weight;
    case 'dimensions':
      return !(width && height && depth);
    case 'photo':
      return (product.images?.length ?? 0) === 0;
    case 'description':
      return !product.description?.trim();
    default:
      return false;
  }
}

/**
 * Missing-data checklist for the completeness indicator. Components (role
 * 'component') only need weight and a photo; model number, videos, research
 * files, circularity properties, components and the bill of materials are
 * never counted (see issue #325).
 */
export function missingFields(product: Product): MissingField[] {
  const fields = product.role === 'component' ? COMPONENT_FIELDS : BASE_FIELDS;
  return fields.filter((field) => isMissing(field.id, product));
}
