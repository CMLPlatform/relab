import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { useDebounce } from 'use-debounce';
import { useDialog } from '@/components/base/dialogContext';
import { useAuth } from '@/context/auth';
import { productTypeLabelMap } from '@/services/api/productTypes';
import { createProductAction, useProductsActions } from './actions';
import {
  useProductTypeLabelsQuery,
  useSearchBrandsQuery,
  useSearchProductTypesQuery,
} from './queries';
import {
  normalizeProductsParams,
  type ProductsSearchParams,
  type RouterSetParams,
  useProductsInfiniteListQuery,
  useProductsParamsSync,
} from './screenData';
import { useProductsFilterUiState, useProductsHeaderState, useSlowLoading } from './state';
import { useProductsWelcomeCard } from './useProductsWelcomeCard';

export type { ProductFilter } from './screenData';

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: products-screen orchestration is intentionally exposed through one screen hook.
export function useProductsScreen() {
  const dialog = useDialog();
  const router = useRouter();
  const { user: currentUser, refetch: refetchUser } = useAuth();
  const params = useLocalSearchParams<ProductsSearchParams>();
  const { filterMode, searchQueryURL, sortBy, activeDatePreset, activeBrands, activeProductTypes } =
    useMemo(() => normalizeProductsParams(params), [params]);
  const createdAfter = useMemo(() => {
    if (!activeDatePreset) return undefined;
    const d = new Date();
    d.setUTCHours(0, 0, 0, 0);
    d.setUTCDate(d.getUTCDate() - activeDatePreset);
    return d;
  }, [activeDatePreset]);
  const [searchQuery, setSearchQuery] = useState(searchQueryURL);
  const [debouncedSearchQuery] = useDebounce(searchQuery, 500);
  // Re-sync the toolbar buffer when the URL's `q` changes from *outside* this
  // screen (browser back/forward to a different ?q=), but not when the URL just
  // caught up to our own debounced write. Guard by the debounced value — the
  // exact string we push out — so an external change resets the buffer while
  // in-flight typing (already past `debouncedSearchQuery`) is left alone.
  // Render-phase reset (React's "adjust state while rendering" pattern), so
  // there's no stale-buffer flash.
  const [lastSearchQueryURL, setLastSearchQueryURL] = useState(searchQueryURL);
  if (searchQueryURL !== lastSearchQueryURL) {
    setLastSearchQueryURL(searchQueryURL);
    if (searchQueryURL !== debouncedSearchQuery) {
      setSearchQuery(searchQueryURL);
    }
  }
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
    searchQuery,
    searchQueryURL,
    updateParams,
  });

  const { data: brandResults, isLoading: brandsLoading } = useSearchBrandsQuery(
    filterUi.brandSearch,
  );
  const { data: typeOptions, isLoading: typesLoading } = useSearchProductTypesQuery(
    filterUi.typeSearch,
  );
  // Selections are stored and filtered by `name`, so the picker keeps offering
  // names; only what the user reads is the label. The selected names are
  // resolved separately because they arrive from the URL, before any search.
  const { data: selectedTypeOptions } = useProductTypeLabelsQuery(activeProductTypes);
  const typeResults = useMemo(() => (typeOptions ?? []).map((type) => type.name), [typeOptions]);
  const typeLabels = useMemo(
    () => ({
      ...productTypeLabelMap(selectedTypeOptions ?? []),
      ...productTypeLabelMap(typeOptions ?? []),
    }),
    [typeOptions, selectedTypeOptions],
  );
  const {
    products,
    total,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
    isFetching,
    isLoading,
    error,
    refetch,
  } = useProductsInfiniteListQuery({
    filterMode,
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
      typeLabels,
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
      products,
      total,
      hasNextPage,
      isFetchingNextPage,
      fetchNextPage,
      isFetching,
      isLoading,
      error,
      refetch,
      onScroll: header.onScroll,
      setHeaderBottom: header.setHeaderBottom,
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
