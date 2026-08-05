import { describe, expect, it } from '@jest/globals';
import { SECTIONS } from '@/components/product/detail/content-sections';
import { baseProduct } from '@/test-utils/index';
import type { Product } from '@/types/Product';

const overview = SECTIONS.find((section) => section.key === 'overview');
if (!overview) throw new Error('overview section missing from SECTIONS');

const bareProduct: Product = {
  ...baseProduct,
  description: undefined,
  brand: undefined,
  model: undefined,
  productTypeID: undefined,
  productTypeName: undefined,
  amountInParent: undefined,
};

describe('overview section isEmpty', () => {
  it('is empty when the product has no description, brand, model, type, or amount', () => {
    expect(overview.isEmpty(bareProduct, { mediaStreamable: false })).toBe(true);
  });

  it('is not empty when only the description is set', () => {
    expect(
      overview.isEmpty({ ...bareProduct, description: 'Some text' }, { mediaStreamable: false }),
    ).toBe(false);
  });

  it('is not empty when only the brand is set', () => {
    expect(overview.isEmpty({ ...bareProduct, brand: 'Acme' }, { mediaStreamable: false })).toBe(
      false,
    );
  });

  it('is not empty when only the model is set', () => {
    expect(overview.isEmpty({ ...bareProduct, model: 'X100' }, { mediaStreamable: false })).toBe(
      false,
    );
  });

  it('is not empty when only the product type is set', () => {
    expect(overview.isEmpty({ ...bareProduct, productTypeID: 1 }, { mediaStreamable: false })).toBe(
      false,
    );
  });

  it('is not empty for a description-less component with amountInParent > 1', () => {
    const component: Product = { ...bareProduct, role: 'component', amountInParent: 3 };
    expect(overview.isEmpty(component, { mediaStreamable: false })).toBe(false);
  });

  it('stays empty for a description-less component with amountInParent of 1', () => {
    const component: Product = { ...bareProduct, role: 'component', amountInParent: 1 };
    expect(overview.isEmpty(component, { mediaStreamable: false })).toBe(true);
  });

  it('ignores amountInParent for a base product (not a component)', () => {
    const product: Product = { ...bareProduct, role: 'product', amountInParent: 3 };
    expect(overview.isEmpty(product, { mediaStreamable: false })).toBe(true);
  });
});

describe('components section titleSuffix', () => {
  const components = SECTIONS.find((section) => section.key === 'components');
  if (!components) throw new Error('components section missing from SECTIONS');

  it('counts the loaded components', () => {
    const loaded = { ...bareProduct, id: 3, name: 'Child' };
    expect(components.titleSuffix?.({ ...bareProduct, components: [loaded, loaded] })).toBe('(2)');
  });

  it('shows (0) when components is undefined', () => {
    expect(components.titleSuffix?.({ ...bareProduct, components: undefined })).toBe('(0)');
  });
});

describe('components section tooltip', () => {
  const components = SECTIONS.find((section) => section.key === 'components');
  if (!components) throw new Error('components section missing from SECTIONS');

  it('explains the save requirement while editing', () => {
    expect(components.tooltip?.(bareProduct, true)).toBe(
      'Add components after saving the product.',
    );
  });

  it('says nothing in view mode', () => {
    // The "Add component" button is present and working in view mode, so the
    // hint contradicted the UI. Its accessible name also contained the
    // button's, which made anything searching for "Add component" — a screen
    // reader or a test — land on the tooltip instead.
    expect(components.tooltip?.(bareProduct, false)).toBeUndefined();
  });
});
