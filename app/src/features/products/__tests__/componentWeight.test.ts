import { describe, expect, it } from '@jest/globals';
import { totalComponentWeight } from '@/features/products/componentWeight';
import { baseProduct } from '@/test-utils/index';
import type { Product } from '@/types/Product';

function part(weight: number | undefined, amount: number, components: Product[] = []): Product {
  return {
    ...baseProduct,
    role: 'component',
    amountInParent: amount,
    physicalProperties: { ...baseProduct.physicalProperties, weight },
    components,
  };
}

describe('totalComponentWeight', () => {
  it('is zero with nothing missing for no components', () => {
    expect(totalComponentWeight([])).toEqual({ grams: 0, missing: 0 });
  });

  it('multiplies each weight by its amount in the parent', () => {
    expect(totalComponentWeight([part(10, 4), part(2.5, 2)])).toEqual({ grams: 45, missing: 0 });
  });

  it('counts a weighed component as a whole, not its sub-components again', () => {
    const assembly = part(100, 1, [part(60, 1), part(30, 1)]);
    expect(totalComponentWeight([assembly])).toEqual({ grams: 100, missing: 0 });
  });

  it('counts an unweighed component through its sub-components, times its own amount', () => {
    // 3 wheels, each 4 spokes of 5 g and one 20 g hub: 3 × (4 × 5 + 20).
    const wheel = part(undefined, 3, [part(5, 4), part(20, 1)]);
    expect(totalComponentWeight([wheel])).toEqual({ grams: 120, missing: 0 });
  });

  it('reports components with neither a weight nor sub-components as missing', () => {
    const deep = part(undefined, 2, [part(7, 1), part(undefined, 5)]);
    expect(totalComponentWeight([part(10, 1), deep, part(undefined, 1)])).toEqual({
      grams: 24,
      missing: 2,
    });
  });

  it('defaults a missing amount to one', () => {
    expect(totalComponentWeight([{ ...part(12, 1), amountInParent: undefined }])).toEqual({
      grams: 12,
      missing: 0,
    });
  });
});
