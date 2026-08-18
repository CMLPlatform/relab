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

  // This push used to be swallowed right after a save — reproduced ~2 in 8 under
  // 4-way parallel E2E load (app/e2e/product-detail.spec.ts), recovering on a
  // second press every time.
  //
  // The cause is that leaving edit mode is itself a navigation. `editMode` is
  // derived solely from the URL (`useProductForm.ts:291`, "nothing flips this at
  // runtime"), so EntityDetailPage clears it with
  // `router.setParams({ edit: undefined })` on save success. A press landing in
  // the same frame dispatches a second navigation while the first is still
  // settling, and the router drops one.
  //
  // Deferring by a frame sequences them instead of racing them: the pending
  // param change commits, then the push dispatches. The proper fix is to stop
  // encoding edit mode in the URL so that exiting it is not a navigation at all,
  // which is a larger rework of EntityDetailPage and useProductForm.
  const newComponent = () => {
    if (typeof product.id !== 'number') return;
    const id = product.id.toString();
    const pathname =
      product.role === 'component'
        ? '/components/[id]/components/new'
        : '/products/[id]/components/new';
    requestAnimationFrame(() => router.push({ pathname, params: { id } }));
  };

  const visibleComponents = expanded ? components : components.slice(0, 5);
  const hiddenCount = Math.max(0, components.length - visibleComponents.length);

  return (
    <View>
      {components.length === 0 && (
        <AppText style={{ opacity: 0.7, marginBottom: 8 }}>
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
      {/* Shown in edit mode too. Creation routes to `?edit=1`, so hiding this
          removed the teardown's actual next step at the exact moment the user
          has the product open in front of them — and the record is already
          persisted by then, which is why the gate is `id`, not `editMode`. */}
      {typeof product.id === 'number' && product.ownedBy === 'me' && (
        <AppButton variant="primary" onPress={newComponent} className="mx-4 my-2">
          Add component
        </AppButton>
      )}
    </View>
  );
}
