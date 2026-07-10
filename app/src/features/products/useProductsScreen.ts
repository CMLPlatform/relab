import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { useDebounce } from 'use-debounce';
import { useDialog } from '@/components/base/dialogContext';
import { useAuth } from '@/context/auth';
import { createProductAction, useProductsActions } from './actions';
import { useSearchBrandsQuery, useSearchProductTypesQuery } from './queries';
import {
  normalizeProductsParams,
  type ProductsSearchParams,
  type RouterSetParams,
  useProductsListQuery,
  useProductsPaging,
  useProductsParamsSync,
} from './screenData';
import { useProductsFilterUiState, useProductsHeaderState, useSlowLoading } from './state';
import { useProductsWelcomeCard } from './useProductsWelcomeCard';

export type { ProductFilter } from './screenData';

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: products-screen orchestration is intentionally exposed through one screen hook.
export function useProductsScreen(numColumns: number) {
  const dialog = useDialog();
  const router = useRouter();
  const { user: currentUser, refetch: refetchUser } = useAuth();
  const params = useLocalSearchParams<ProductsSearchParams>();
  const {
    filterMode,
    searchQueryURL,
    page,
    sortBy,
    activeDatePreset,
    activeBrands,
    activeProductTypes,
  } = useMemo(() => normalizeProductsParams(params), [params]);
  const createdAfter = useMemo(() => {
    if (!activeDatePreset) return undefined;
    const d = new Date();
    d.setUTCHours(0, 0, 0, 0);
    d.setUTCDate(d.getUTCDate() - activeDatePreset);
    return d;
  }, [activeDatePreset]);
  const [searchQuery, setSearchQuery] = useState(searchQueryURL);
  const [debouncedSearchQuery] = useDebounce(searchQuery, 500);
  const filterUi = useProductsFilterUiState();
  const header = useProductsHeaderState();
  const isAuthenticated = !!currentUser;
  const newProduct = useCallback(
    () => createProductAction({ dialog, router, currentUser }),
    [dialog, router, currentUser],
  );
  const updateParams = useCallback(
    (newParams: RouterSetParams) => router.setParams(newParams),
    [router],
  );

  useProductsParamsSync({
    currentUser,
    debouncedSearchQuery,
    filterMode,
    searchQueryURL,
    updateParams,
  });

  const pagingResetKey = useMemo(
    () =>
      JSON.stringify([
        searchQueryURL,
        filterMode,
        sortBy,
        activeBrands,
        activeProductTypes,
        activeDatePreset,
      ]),
    [searchQueryURL, filterMode, sortBy, activeBrands, activeProductTypes, activeDatePreset],
  );
  const { effectivePage, setPage } = useProductsPaging({
    numColumns,
    page,
    updateParams,
    resetKey: pagingResetKey,
  });
  const { data: brandResults, isLoading: brandsLoading } = useSearchBrandsQuery(
    filterUi.brandSearch,
  );
  const { data: typeResults, isLoading: typesLoading } = useSearchProductTypesQuery(
    filterUi.typeSearch,
  );
  const { data, isFetching, isLoading, error, refetch, productList } = useProductsListQuery({
    numColumns,
    filterMode,
    effectivePage,
    searchQueryURL,
    sortBy,
    activeBrands,
    createdAfter,
    activeProductTypes,
  });
  const slowLoading = useSlowLoading(isLoading);
  const { showInfoCard, dismissInfoCard } = useProductsWelcomeCard({
    isAuthenticated,
    currentUser,
    refetchUser,
  });
  const actions = useProductsActions({ filterMode, router, updateParams });
  const totalPages = data?.pages ?? 0;
  const total = data?.total ?? 0;
  const hasMore = (data?.page ?? 0) < (data?.pages ?? 0);

  return {
    screen: {
      params,
      filterMode,
      activeDatePreset,
      activeBrands,
      activeProductTypes,
      isAuthenticated,
      currentUser,
      headerBottom: header.headerBottom,
      fabExtended: header.fabExtended,
      showWelcomeCard: Boolean(showInfoCard),
      slowLoading,
    },
    search: {
      query: searchQuery,
      queryFromUrl: searchQueryURL,
      debouncedQuery: debouncedSearchQuery,
      sortBy,
      sortMenuVisible: filterUi.sortMenuVisible,
      setQuery: setSearchQuery,
      setSortMenuVisible: filterUi.setSortMenuVisible,
      clearQuery: actions.clearQuery,
      applySort: actions.applySort,
    },
    filters: {
      brandResults,
      brandsLoading,
      typeResults,
      typesLoading,
      dateMenuVisible: filterUi.dateMenuVisible,
      brandModalVisible: filterUi.brandModalVisible,
      typeModalVisible: filterUi.typeModalVisible,
      brandSearch: filterUi.brandSearch,
      typeSearch: filterUi.typeSearch,
      setDateMenuVisible: filterUi.setDateMenuVisible,
      setBrandModalVisible: filterUi.setBrandModalVisible,
      setTypeModalVisible: filterUi.setTypeModalVisible,
      setBrandSearch: filterUi.setBrandSearch,
      setTypeSearch: filterUi.setTypeSearch,
      toggleMine: actions.toggleMine,
      clearMine: actions.clearMine,
      applyDatePreset: actions.applyDatePreset,
      applyBrandSelection: actions.applyBrandSelection,
      clearBrands: actions.clearBrands,
      applyTypeSelection: actions.applyTypeSelection,
      clearTypes: actions.clearTypes,
    },
    list: {
      data,
      productList,
      effectivePage,
      totalPages,
      total,
      hasMore,
      isFetching,
      isLoading,
      error,
      refetch,
      onScroll: header.onScroll,
      setHeaderBottom: header.setHeaderBottom,
      setPage,
    },
    actions: {
      dismissWelcomeCard: dismissInfoCard,
      createProduct: newProduct,
      goToLogin: actions.goToLogin,
      goToProfile: actions.goToProfile,
      updateParams: actions.updateParams,
    },
  };
}
