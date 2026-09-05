import type { useRouter } from 'expo-router';
import { useCallback } from 'react';
import type { DialogContextType } from '@/components/base/dialogContext';
import { FILTER_CSV_SEPARATOR } from '@/services/api/products';
import type { ProductFilter, RouterSetParams } from './screenData';

type CurrentUser = { isVerified: boolean };

/**
 * Sign-in/verify gating for the "Add product" FAB. Drops straight into
 * `/products/new` once the gating passes — the form validates the name itself.
 */
export function createProductAction({
  dialog,
  router,
  currentUser,
}: {
  dialog: DialogContextType;
  router: ReturnType<typeof useRouter>;
  currentUser: CurrentUser | null | undefined;
}) {
  if (!currentUser) {
    dialog.alert({
      title: 'Sign in required',
      message: 'Sign in to add new products and manage your own submissions.',
      buttons: [
        { text: 'Cancel' },
        { text: 'Sign in', onPress: () => router.push('/login?redirectTo=/products') },
      ],
    });
    return;
  }
  if (!currentUser.isVerified) {
    dialog.alert({
      title: 'Verify your email first',
      message: 'Check your inbox for the verification link, or resend it from your Account.',
      buttons: [
        { text: 'OK' },
        { text: 'Go to Account', onPress: () => router.navigate('/account') },
      ],
    });
    return;
  }
  router.push('/products/new');
}

export function useProductsActions({
  filterMode,
  router,
  updateParams,
}: {
  filterMode: ProductFilter;
  router: ReturnType<typeof useRouter>;
  updateParams: (newParams: RouterSetParams) => void;
}) {
  const clearQuery = useCallback(() => updateParams({ q: undefined }), [updateParams]);
  const applySort = useCallback(
    (sort: readonly string[]) => updateParams({ sort: sort.length ? sort.join(',') : undefined }),
    [updateParams],
  );
  const toggleMine = useCallback(
    () => updateParams({ filterMode: filterMode === 'mine' ? 'all' : 'mine' }),
    [filterMode, updateParams],
  );
  const clearMine = useCallback(() => updateParams({ filterMode: 'all' }), [updateParams]);
  const applyDatePreset = useCallback(
    (days: string | undefined) => updateParams({ days }),
    [updateParams],
  );
  const applyBrandSelection = useCallback(
    (values: string[]) =>
      updateParams({
        brands: values.length ? values.join(FILTER_CSV_SEPARATOR) : undefined,
      }),
    [updateParams],
  );
  const clearBrands = useCallback(() => updateParams({ brands: undefined }), [updateParams]);
  const applyTypeSelection = useCallback(
    (values: string[]) =>
      updateParams({
        types: values.length ? values.join(FILTER_CSV_SEPARATOR) : undefined,
      }),
    [updateParams],
  );
  const clearTypes = useCallback(() => updateParams({ types: undefined }), [updateParams]);
  const goToLogin = useCallback(() => {
    router.push('/login');
  }, [router]);
  const goToProfile = useCallback(() => {
    router.navigate('/account');
  }, [router]);

  return {
    clearQuery,
    applySort,
    toggleMine,
    clearMine,
    applyDatePreset,
    applyBrandSelection,
    clearBrands,
    applyTypeSelection,
    clearTypes,
    goToLogin,
    goToProfile,
    updateParams,
  };
}
