import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo } from 'react';
import { ProductDetailScreen } from './ProductDetailScreen';

type NewComponentParams = {
  /** Parent id from the URL segment. */
  id: string;
};

/**
 * Create-a-child-component screen, shared by the product-parent and
 * component-parent `components/new` routes. Only `parentRole` differs.
 */
export function NewComponentPage({ parentRole }: { parentRole: 'product' | 'component' }) {
  const router = useRouter();
  const params = useLocalSearchParams<NewComponentParams>();
  const parsedParentID = Number.parseInt(params.id ?? '', 10);
  const parentID = Number.isFinite(parsedParentID) ? parsedParentID : undefined;
  const draftSeed = useMemo(() => ({ parentID, parentRole }), [parentID, parentRole]);

  return (
    <ProductDetailScreen
      formOptions={{
        role: 'component',
        isNew: true,
        initialEditMode: true,
        draftSeed,
        onSaveSuccess: (savedId) => {
          router.replace({
            pathname: '/components/[id]',
            params: { id: savedId.toString() },
          });
        },
      }}
    />
  );
}
