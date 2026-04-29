import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo } from 'react';
import { ProductDetailScreen } from '@/components/product/detail/ProductDetailScreen';

/**
 * Base-product detail + edit. Edit mode is a URL query param (`?edit=1`) so
 * pressing the pencil FAB doesn't unmount the screen — scroll position and
 * fetched data stay put, which matters when you're bouncing between sections
 * of a long product form.
 */
export default function ProductPage() {
  const router = useRouter();
  const params = useLocalSearchParams<{ edit?: string }>();
  const isEditing = params.edit === '1';

  const formOptions = useMemo(
    () => ({
      role: 'product' as const,
      initialEditMode: isEditing,
      onSaveSuccess: () => router.setParams({ edit: undefined }),
    }),
    [isEditing, router],
  );

  return <ProductDetailScreen formOptions={formOptions} />;
}
