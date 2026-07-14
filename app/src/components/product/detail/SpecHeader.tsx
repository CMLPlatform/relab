import { View } from 'react-native';
import { AppText } from '@/components/base/AppText';
import { type SpecFact, SpecFacts } from '@/components/base/SpecFacts';
import type { Product } from '@/types/Product';
import { formatWeight } from './spec-utils';

function buildFacts(product: Product): SpecFact[] {
  const facts: SpecFact[] = [];
  const componentCount = product.components?.length ?? 0;
  if (componentCount > 0) facts.push({ label: 'Components', value: String(componentCount) });
  const { weight, width, height, depth } = product.physicalProperties ?? {};
  if (weight) facts.push({ label: 'Weight', value: formatWeight(weight) });
  if (width && height && depth) {
    facts.push({ label: 'Size', value: `${width}×${height}×${depth} cm` });
  }
  return facts;
}

/**
 * Spec-sheet identity block: the record's name, what it is, and its key
 * measurable facts — the "engineering documentation" voice of the brand.
 */
export function SpecHeader({ product }: { product: Product }) {
  const identity = [product.productTypeName, product.brand, product.model]
    .filter(Boolean)
    .join(' · ');

  return (
    <View className="gap-2 px-4 py-3">
      <AppText variant="display">{product.name}</AppText>
      {identity ? (
        <AppText variant="body" className="opacity-70">
          {identity}
        </AppText>
      ) : null}
      <SpecFacts facts={buildFacts(product)} />
    </View>
  );
}
