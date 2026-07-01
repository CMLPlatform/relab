import { useLocalSearchParams, useRouter } from 'expo-router';
import type { Dispatch, SetStateAction } from 'react';
import { useCallback, useMemo, useState } from 'react';
import { useDebounce } from 'use-debounce';
import { useDialog } from '@/components/base/dialogContext';
import { useAuth } from '@/context/auth';
import type { Product } from '@/types/Product';
import { createProductAction, useProductsActions } from './productsScreen.actions';
import {
  normalizeProductsParams,
  type ProductFilter,
  type ProductsSearchParams,
  type RouterSetParams,
  useProductsListQuery,
  useProductsPaging,
  useProductsParamsSync,
} from './productsScreen.data';
import {
  useProductsFilterUiState,
  useProductsHeaderState,
  useSlowLoadingState,
} from './productsScreen.state';
import { useSearchBrandsQuery, useSearchProductTypesQuery } from './queries';
import { useProductsWelcomeCard } from './useProductsWelcomeCard';

export type { ProductFilter } from './productsScreen.data';

function buildProductsScreenState({
  params,
  filterMode,
  activeDatePreset,
  activeBrands,
  activeProductTypes,
  isAuthenticated,
  currentUser,
  header,
  showInfoCard,
  slowLoading,
  searchQuery,
  searchQueryURL,
  debouncedSearchQuery,
  sortBy,
  filterUi,
  setSearchQuery,
  actions,
  brandResults,
  brandsLoading,
  typeResults,
  typesLoading,
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
  setPage,
  dismissInfoCard,
  newProduct,
}: {
  params: ProductsSearchParams;
  filterMode: ProductFilter;
  activeDatePreset: number | null;
  activeBrands: string[];
  activeProductTypes: string[];
  isAuthenticated: boolean;
  currentUser: ReturnType<typeof useAuth>['user'];
  header: ReturnType<typeof useProductsHeaderState>;
  showInfoCard: boolean | null;
  slowLoading: boolean;
  searchQuery: string;
  searchQueryURL: string;
  debouncedSearchQuery: string;
  sortBy: string[];
  filterUi: ReturnType<typeof useProductsFilterUiState>;
  setSearchQuery: Dispatch<SetStateAction<string>>;
  actions: ReturnType<typeof useProductsActions>;
  brandResults: ReturnType<typeof useSearchBrandsQuery>['data'];
  brandsLoading: boolean;
  typeResults: ReturnType<typeof useSearchProductTypesQuery>['data'];
  typesLoading: boolean;
  data: ReturnType<typeof useProductsListQuery>['data'];
  productList: Product[];
  effectivePage: number;
  totalPages: number;
  total: number;
  hasMore: boolean;
  isFetching: boolean;
  isLoading: boolean;
  error: ReturnType<typeof useProductsListQuery>['error'];
  refetch: ReturnType<typeof useProductsListQuery>['refetch'];
  setPage: (nextPage: number) => void;
  dismissInfoCard: () => void;
  newProduct: () => void;
}) {
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

  const { effectivePage, setPage } = useProductsPaging({ numColumns, page, updateParams });
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
  const slowLoading = useSlowLoadingState(isLoading);
  const { showInfoCard, dismissInfoCard } = useProductsWelcomeCard({
    isAuthenticated,
    currentUser,
    refetchUser,
  });
  const actions = useProductsActions({ filterMode, router, updateParams });
  const totalPages = data?.pages ?? 0;
  const total = data?.total ?? 0;
  const hasMore = (data?.page ?? 0) < (data?.pages ?? 0);

  return buildProductsScreenState({
    params,
    filterMode,
    activeDatePreset,
    activeBrands,
    activeProductTypes,
    isAuthenticated,
    currentUser,
    header,
    showInfoCard: showInfoCard ?? false,
    slowLoading,
    searchQuery,
    searchQueryURL,
    debouncedSearchQuery,
    sortBy,
    filterUi,
    setSearchQuery,
    actions,
    brandResults,
    brandsLoading,
    typeResults,
    typesLoading,
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
    setPage,
    dismissInfoCard,
    newProduct,
  });
}
