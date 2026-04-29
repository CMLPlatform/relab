import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo } from 'react';
import { ProductDetailScreen } from '@/components/product/detail/ProductDetailScreen';

type NewComponentParams = {
  /** Parent component id from the URL segment. */
  id: string;
};

export default function NestedComponentNewPage() {
  const router = useRouter();
  const params = useLocalSearchParams<NewComponentParams>();
  const parsedParentID = Number.parseInt(params.id ?? '', 10);
  const parentID = Number.isFinite(parsedParentID) ? parsedParentID : undefined;
  const draftSeed = useMemo(() => ({ parentID, parentRole: 'component' as const }), [parentID]);

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
