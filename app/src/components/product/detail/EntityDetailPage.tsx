import { useLocalSearchParams, useRouter } from 'expo-router';
import Head from 'expo-router/head';
import { useMemo } from 'react';
import { ProductDetailScreen } from './ProductDetailScreen';

/**
 * Detail + edit screen shared by the product and component `[id]` routes. Edit
 * mode is a URL query param (`?edit=1`) so pressing the pencil FAB doesn't
 * unmount the screen — scroll position and fetched data stay put, which matters
 * when bouncing between sections of a long form. Only `role` and the optional
 * document title differ between the two routes.
 */
export function EntityDetailPage({
  productRole,
  headTitle,
}: {
  productRole: 'product' | 'component';
  headTitle?: string;
}) {
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

  return (
    <>
      {headTitle ? (
        <Head>
          <title>{headTitle}</title>
        </Head>
      ) : null}
      <ProductDetailScreen formOptions={formOptions} />
    </>
  );
}
