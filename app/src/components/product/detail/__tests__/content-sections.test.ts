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

  // Was asserted for any edit-mode product. That was false: the create flow
  // lands on `?edit=1` with the record already persisted, so the hint told the
  // user to save something already saved while the button sat right there.
  it('explains the save requirement only while the record has no id', () => {
    expect(components.tooltip?.({ ...bareProduct, id: undefined }, true)).toBe(
      'Add components after saving the product.',
    );
  });

  it('says nothing once the record has an id, even in edit mode', () => {
    expect(components.tooltip?.({ ...bareProduct, id: 1 }, true)).toBeUndefined();
  });

  it('says nothing in view mode', () => {
    // The "Add component" button is present and working in view mode, so the
    // hint contradicted the UI. Its accessible name also contained the
    // button's, which made anything searching for "Add component" — a screen
    // reader or a test — land on the tooltip instead.
    expect(components.tooltip?.(bareProduct, false)).toBeUndefined();
  });
});

describe('section chunking', () => {
  it('has four sections so the phone nav fits one row', () => {
    expect(SECTIONS.map((section) => section.key)).toEqual([
      'overview',
      'components',
      'properties',
      'media',
    ]);
  });

  describe('properties section', () => {
    const properties = SECTIONS.find((section) => section.key === 'properties');
    if (!properties) throw new Error('properties section missing from SECTIONS');
    const emptyProps: Product = {
      ...bareProduct,
      physicalProperties: {
        weight: undefined,
        width: undefined,
        height: undefined,
        depth: undefined,
      },
      circularityProperties: {
        recyclability: null,
        disassemblability: null,
        remanufacturability: null,
      },
    };

    it('is empty only when both measurements and circularity notes are absent', () => {
      expect(properties.isEmpty(emptyProps, { mediaStreamable: false })).toBe(true);
      expect(
        properties.isEmpty(
          { ...emptyProps, physicalProperties: { ...emptyProps.physicalProperties, weight: 12 } },
          { mediaStreamable: false },
        ),
      ).toBe(false);
      expect(
        properties.isEmpty(
          {
            ...emptyProps,
            circularityProperties: { ...emptyProps.circularityProperties, recyclability: 'ok' },
          },
          { mediaStreamable: false },
        ),
      ).toBe(false);
    });

    it('offers one add-row for the merged section', () => {
      expect(properties.addLabel).toBe('Add properties');
      expect(properties.label).toBe('Properties');
    });
  });
});
