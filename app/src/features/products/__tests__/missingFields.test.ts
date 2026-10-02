import { describe, expect, it } from '@jest/globals';
import { missingFields } from '@/features/products/missingFields';
import { newProduct } from '@/services/api/products';
import type { Product } from '@/types/Product';

function completeBaseProduct(): Product {
  return {
    ...newProduct({ name: 'Kettle', brand: 'Acme' }),
    productTypeID: 1,
    productTypeName: 'Kettle',
    description: 'A kettle.',
    physicalProperties: { weight: 500, width: 10, height: 20, depth: 15 },
    images: [{ url: 'https://example.com/a.jpg', description: '' }],
  };
}

describe('missingFields', () => {
  it('returns nothing for a fully filled-in base product', () => {
    expect(missingFields(completeBaseProduct())).toEqual([]);
  });

  it('flags a missing product type', () => {
    const product = {
      ...completeBaseProduct(),
      productTypeID: undefined,
      productTypeName: undefined,
    };
    expect(missingFields(product).map((f) => f.id)).toEqual(['productType']);
  });

  it('flags a missing brand', () => {
    const product = { ...completeBaseProduct(), brand: undefined };
    expect(missingFields(product).map((f) => f.id)).toEqual(['brand']);
  });

  it('flags a missing weight', () => {
    const product = {
      ...completeBaseProduct(),
      physicalProperties: { ...completeBaseProduct().physicalProperties, weight: undefined },
    };
    expect(missingFields(product).map((f) => f.id)).toEqual(['weight']);
  });

  it('counts dimensions as recorded when any of width/height/depth is set', () => {
    const product = {
      ...completeBaseProduct(),
      physicalProperties: { ...completeBaseProduct().physicalProperties, depth: undefined },
    };
    expect(missingFields(product).map((f) => f.id)).toEqual([]);
  });

  it('flags dimensions only when width, height and depth are all unset', () => {
    const product = {
      ...completeBaseProduct(),
      physicalProperties: {
        ...completeBaseProduct().physicalProperties,
        width: undefined,
        height: undefined,
        depth: undefined,
      },
    };
    expect(missingFields(product).map((f) => f.id)).toEqual(['dimensions']);
  });

  it('flags a missing photo', () => {
    const product = { ...completeBaseProduct(), images: [] };
    expect(missingFields(product).map((f) => f.id)).toEqual(['photo']);
  });

  it('flags a missing description', () => {
    const product = { ...completeBaseProduct(), description: undefined };
    expect(missingFields(product).map((f) => f.id)).toEqual(['description']);
  });

  it('treats blank strings as missing', () => {
    const product = { ...completeBaseProduct(), brand: '   ', description: '  ' };
    expect(
      missingFields(product)
        .map((f) => f.id)
        .sort(),
    ).toEqual(['brand', 'description']);
  });

  it('only checks weight and photo for a component, ignoring type/brand/dimensions/description/model', () => {
    const component: Product = {
      ...newProduct({ parentID: 1 }),
      role: 'component',
      productTypeID: undefined,
      productTypeName: undefined,
      brand: undefined,
      model: undefined,
      description: undefined,
      physicalProperties: {
        weight: undefined,
        width: undefined,
        height: undefined,
        depth: undefined,
      },
      images: [],
    };
    expect(
      missingFields(component)
        .map((f) => f.id)
        .sort(),
    ).toEqual(['photo', 'weight']);
  });

  it('does not flag a component missing model, dimensions or description', () => {
    const component: Product = {
      ...newProduct({ parentID: 1 }),
      role: 'component',
      physicalProperties: { weight: 100, width: undefined, height: undefined, depth: undefined },
      images: [{ url: 'https://example.com/a.jpg', description: '' }],
    };
    expect(missingFields(component)).toEqual([]);
  });
});
