import type { Product } from '@/types/Product';

/**
 * Total weight of a list of components, from each component's own recorded weight.
 *
 * A component with a weight counts as a whole: its sub-components are part of that
 * weight and are not added again. A component without one counts through its
 * sub-components, times its own amount. One with neither adds to `missing`, so a
 * caller can say the total is partial instead of showing it as complete.
 *
 * Returns `grams`, each component's weight times its amount in its parent, and `missing`,
 * the components that added nothing.
 */
export function totalComponentWeight(components: Product[]): { grams: number; missing: number } {
  let grams = 0;
  let missing = 0;
  for (const component of components) {
    const amount = component.amountInParent ?? 1;
    const weight = component.physicalProperties.weight;
    if (weight !== undefined) {
      grams += weight * amount;
    } else if (component.components?.length) {
      const children = totalComponentWeight(component.components);
      grams += children.grams * amount;
      missing += children.missing;
    } else {
      missing += 1;
    }
  }
  return { grams, missing };
}
