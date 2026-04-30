import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo } from 'react';
import { ProductDetailScreen } from '@/components/product/detail/ProductDetailScreen';

/**
 * Component detail + edit. Edit mode is a URL query param (`?edit=1`) so the
 * screen doesn't unmount when the user enters edit — scroll and fetched data
 * stay put.
 */
export default function ComponentPage() {
  const router = useRouter();
  const params = useLocalSearchParams<{ edit?: string }>();
  const isEditing = params.edit === '1';

  const formOptions = useMemo(
    () => ({
      role: 'component' as const,
      initialEditMode: isEditing,
      onSaveSuccess: () => router.setParams({ edit: undefined }),
    }),
    [isEditing, router],
  );

  return <ProductDetailScreen formOptions={formOptions} />;
}
