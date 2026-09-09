import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo } from 'react';
import { ProductDetailScreen } from './ProductDetailScreen';

/**
 * Detail + edit screen for the product and component `[id]` routes. Edit mode
 * is a URL query param (`?edit=1`) so entering it does not unmount the screen.
 */
export function EntityDetailPage({ productRole }: { productRole: 'product' | 'component' }) {
  const router = useRouter();
  const params = useLocalSearchParams<{ edit?: string }>();
  const isEditing = params.edit === '1';

  const formOptions = useMemo(
    () => ({
      role: productRole,
      initialEditMode: isEditing,
      onSaveSuccess: () => router.setParams({ edit: undefined }),
    }),
    [productRole, isEditing, router],
  );

  return <ProductDetailScreen formOptions={formOptions} />;
}
