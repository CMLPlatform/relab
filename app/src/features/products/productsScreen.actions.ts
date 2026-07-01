import type { useRouter } from 'expo-router';
import { useCallback } from 'react';
import type { DialogContextType } from '@/components/base/dialogContext';
import type { ProductFilter, RouterSetParams } from './productsScreen.data';

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
      title: 'Sign In Required',
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
      title: 'Email Verification Required',
      message:
        'Please verify your email address before creating products. Check your inbox for the verification link or go to your Account to resend it.',
      buttons: [{ text: 'OK' }, { text: 'Go to Account', onPress: () => router.push('/account') }],
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
  const clearQuery = useCallback(() => updateParams({ q: undefined, page: '1' }), [updateParams]);
  const applySort = useCallback(
    (sort: readonly string[]) =>
      updateParams({ sort: sort.length ? sort.join(',') : undefined, page: '1' }),
    [updateParams],
  );
  const toggleMine = useCallback(
    () => updateParams({ filterMode: filterMode === 'mine' ? 'all' : 'mine', page: '1' }),
    [filterMode, updateParams],
  );
  const clearMine = useCallback(
    () => updateParams({ filterMode: 'all', page: '1' }),
    [updateParams],
  );
  const applyDatePreset = useCallback(
    (days: string | undefined) => updateParams({ days, page: '1' }),
    [updateParams],
  );
  const applyBrandSelection = useCallback(
    (values: string[]) =>
      updateParams({ brands: values.length ? values.join(',') : undefined, page: '1' }),
    [updateParams],
  );
  const clearBrands = useCallback(
    () => updateParams({ brands: undefined, page: '1' }),
    [updateParams],
  );
  const applyTypeSelection = useCallback(
    (values: string[]) =>
      updateParams({ types: values.length ? values.join(',') : undefined, page: '1' }),
    [updateParams],
  );
  const clearTypes = useCallback(
    () => updateParams({ types: undefined, page: '1' }),
    [updateParams],
  );
  const goToLogin = useCallback(() => {
    router.push('/login');
  }, [router]);
  const goToProfile = useCallback(() => {
    router.push('/account');
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
