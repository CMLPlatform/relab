import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { AppButton } from '@/components/base/AppButton';
import { AppText } from '@/components/base/AppText';
import { entityLabel, type Product } from '@/types/Product';
import { ComponentRow } from './ComponentRow';

interface Props {
  product: Product;
  editMode: boolean;
}

export default function ProductComponents({ product, editMode }: Props) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const components = product.components ?? [];
  const label = entityLabel(product);
  const toggleExpanded = useCallback(() => setExpanded((current) => !current), []);

  // NOTE: this push is occasionally swallowed right after a save, leaving the
  // button visibly dead — reproduced ~2 in 8 under 4-way parallel E2E load
  // (app/e2e/product-detail.spec.ts). Not the guard below: `Product ID: N` is
  // rendered from this same object at the time of the lost click, so `id` is a
  // number. It recovers on a second press every time, which points at the
  // `router.setParams({ edit: undefined })` that EntityDetailPage fires on save
  // landing after this push. Fixing it means reworking how edit mode leaves the
  // URL; left alone for now because the user-visible cost is one extra click.
  const newComponent = () => {
    if (typeof product.id !== 'number') return;
    router.push({
      pathname:
        product.role === 'component'
          ? '/components/[id]/components/new'
          : '/products/[id]/components/new',
      params: { id: product.id.toString() },
    });
  };

  const visibleComponents = expanded ? components : components.slice(0, 5);
  const hiddenCount = Math.max(0, components.length - visibleComponents.length);

  return (
    <View>
      {components.length === 0 && (
        <AppText variant="plain" style={{ opacity: 0.7, marginBottom: 8 }}>
          This {label} has no subcomponents.
        </AppText>
      )}
      {visibleComponents.map((component) => (
        <ComponentRow key={component.id} component={component} enabled={!editMode} />
      ))}
      {components.length > 5 && (
        <AppButton variant="ghost" onPress={toggleExpanded}>
          {expanded ? 'Show less' : `Show ${hiddenCount} more`}
        </AppButton>
      )}
      {editMode || product.ownedBy !== 'me' || (
        <AppButton variant="primary" onPress={newComponent} className="mx-4 my-2">
          Add component
        </AppButton>
      )}
    </View>
  );
}
