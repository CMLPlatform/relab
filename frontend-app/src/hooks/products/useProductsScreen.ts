import { useQueries } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import { useDebounce } from 'use-debounce';
import { useDialog } from '@/components/common/dialogContext';
import { useAuth } from '@/context/auth';
import { useNewProductAction } from '@/hooks/products/useNewProductAction';
import { useProductsWelcomeCard } from '@/hooks/products/useProductsWelcomeCard';
import {
  DEFAULT_PRODUCT_SORT,
  PRODUCT_SORT_OPTIONS,
  productsQueryOptions,
  useSearchBrandsQuery,
  useSearchProductTypesQuery,
} from '@/hooks/useProductQueries';
import type { Product } from '@/types/Product';

export type ProductFilter = 'all' | 'mine';
type RouterSetParams = Parameters<ReturnType<typeof useRouter>['setParams']>[0];
type TimerWithUnref = ReturnType<typeof setTimeout> & { unref(): void };
const FALLBACK_DEFAULT_SORT = Array.from(PRODUCT_SORT_OPTIONS[1].value);

type ProductsSearchParams = {
  filterMode?: string;
  q?: string;
  page?: string;
  sort?: string;
  brands?: string;
  types?: string;
  days?: string;
};

function normalizeProductsParams(params: ProductsSearchParams) {
  const searchQueryURL = params.q ?? '';
  const activeDatePreset = params.days ? Number(params.days) : null;

  return {
    filterMode: (params.filterMode as ProductFilter) || 'all',
    searchQueryURL,
    page: Number(params.page) || 1,
    sortBy: params.sort
      ? params.sort.split(',')
      : searchQueryURL
        ? (['rank'] as string[])
        : Array.from(DEFAULT_PRODUCT_SORT ?? FALLBACK_DEFAULT_SORT),
    activeDatePreset,
    activeBrands: params.brands ? params.brands.split(',') : [],
    activeProductTypes: params.types ? params.types.split(',') : [],
    createdAfter: activeDatePreset
      ? new Date(Date.now() - activeDatePreset * 86_400_000)
      : undefined,
  };
}

function useSlowLoadingState(isLoading: boolean) {
  const [slowLoading, setSlowLoading] = useState(false);

  useEffect(() => {
    if (!isLoading) {
      return;
    }

    const resetTimer = setTimeout(() => setSlowLoading(false), 0);
    const timer = setTimeout(() => setSlowLoading(true), 5000);
    if (timer && typeof timer === 'object' && 'unref' in timer) {
      (timer as TimerWithUnref).unref();
    }
    return () => {
      clearTimeout(resetTimer);
      clearTimeout(timer);
    };
  }, [isLoading]);

  return slowLoading;
}

function useProductsFilterUiState() {
  const [sortMenuVisible, setSortMenuVisible] = useState(false);
  const [dateMenuVisible, setDateMenuVisible] = useState(false);
  const [brandModalVisible, setBrandModalVisible] = useState(false);
  const [typeModalVisible, setTypeModalVisible] = useState(false);
  const [brandSearch, setBrandSearch] = useState('');
  const [typeSearch, setTypeSearch] = useState('');

  return {
    sortMenuVisible,
    setSortMenuVisible,
    dateMenuVisible,
    setDateMenuVisible,
    brandModalVisible,
    setBrandModalVisible,
    typeModalVisible,
    setTypeModalVisible,
    brandSearch,
    setBrandSearch,
    typeSearch,
    setTypeSearch,
  };
}

function useProductsHeaderState() {
  const [headerBottom, setHeaderBottom] = useState(0);
  const [fabExtended, setFabExtended] = useState(true);

  const onScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    setFabExtended(event.nativeEvent.contentOffset.y <= 0);
  }, []);

  return {
    headerBottom,
    setHeaderBottom,
    fabExtended,
    onScroll,
  };
}

function mergeProductPages(previous: Product[], nextPage: Product[]) {
  const existingIds = new Set(previous.map((product) => product.id));
  return [...previous, ...nextPage.filter((product) => !existingIds.has(product.id))];
}

function useProductsPaging({
  numColumns,
  page,
  updateParams,
}: {
  numColumns: number;
  page: number;
  updateParams: (newParams: RouterSetParams) => void;
}) {
  const [mobilePage, setMobilePage] = useState(1);
  const setPage = useCallback(
    (nextPage: number) =>
      numColumns === 1 ? setMobilePage(nextPage) : updateParams({ page: String(nextPage) }),
    [numColumns, updateParams],
  );

  return {
    effectivePage: numColumns === 1 ? mobilePage : page,
    setPage,
  };
}

function useProductsListQuery({
  numColumns,
  filterMode,
  effectivePage,
  searchQueryURL,
  sortBy,
  activeBrands,
  createdAfter,
  activeProductTypes,
}: {
  numColumns: number;
  filterMode: ProductFilter;
  effectivePage: number;
  searchQueryURL: string;
  sortBy: string[];
  activeBrands: string[];
  createdAfter?: Date;
  activeProductTypes: string[];
}) {
  const queryPages = useMemo(
    () => Array.from({ length: numColumns === 1 ? effectivePage : 1 }, (_, index) => index + 1),
    [effectivePage, numColumns],
  );
  const queries = useQueries({
    queries: queryPages.map((queryPage) =>
      productsQueryOptions(filterMode, queryPage, searchQueryURL, sortBy, {
        brands: activeBrands,
        createdAfter,
        productTypeNames: activeProductTypes,
      }),
    ),
  });

  const currentQuery = queries[queries.length - 1];
  const productList = useMemo(() => {
    if (numColumns !== 1) {
      return currentQuery?.data?.items ?? [];
    }

    return queries.reduce<Product[]>((merged, query) => {
      const items = query.data?.items ?? [];
      return mergeProductPages(merged, items);
    }, []);
  }, [currentQuery?.data?.items, numColumns, queries]);

  return {
    data: currentQuery?.data,
    isFetching: queries.some((query) => query.isFetching),
    isLoading:
      !queries.some((query) => Boolean(query.data)) && queries.some((query) => query.isLoading),
    error: [...queries].reverse().find((query) => query.error)?.error ?? null,
    refetch: () => Promise.all(queries.map((query) => query.refetch())),
    productList,
  };
}

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: products-screen state is intentionally centralized in one hook for the screen layer.
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
    createdAfter,
  } = useMemo(() => normalizeProductsParams(params), [params]);

  const [searchQuery, setSearchQuery] = useState(searchQueryURL);
  const [debouncedSearchQuery] = useDebounce(searchQuery, 500);
  const filterUi = useProductsFilterUiState();
  const header = useProductsHeaderState();
  const isAuthenticated = !!currentUser;
  const newProduct = useNewProductAction({ dialog, router, currentUser });

  const updateParams = useCallback(
    (newParams: RouterSetParams) => {
      router.setParams(newParams);
    },
    [router],
  );

  useEffect(() => {
    if (debouncedSearchQuery !== searchQueryURL) {
      updateParams({ q: debouncedSearchQuery || undefined, page: '1' });
    }
  }, [debouncedSearchQuery, searchQueryURL, updateParams]);

  useEffect(() => {
    if (!searchQueryURL && params.sort === 'rank') {
      updateParams({ sort: undefined });
    }
  }, [searchQueryURL, params.sort, updateParams]);

  const { effectivePage, setPage } = useProductsPaging({
    numColumns,
    page,
    updateParams,
  });

  const { data: brandResults, isLoading: brandsLoading } = useSearchBrandsQuery(
    filterUi.brandSearch,
  );
  const { data: typeResults, isLoading: typesLoading } = useSearchProductTypesQuery(
    filterUi.typeSearch,
  );

  useEffect(() => {
    if (!currentUser && filterMode === 'mine') {
      updateParams({ filterMode: 'all', page: '1' });
    }
  }, [currentUser, filterMode, updateParams]);

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

  const clearQuery = useCallback(() => updateParams({ q: undefined, page: '1' }), [updateParams]);
  const applySort = useCallback(
    (sort: readonly string[]) => updateParams({ sort: sort.join(','), page: '1' }),
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
    router.push('/profile');
  }, [router]);
  const totalPages = data?.pages ?? 0;
  const total = data?.total ?? 0;
  const hasMore = (data?.page ?? 0) < (data?.pages ?? 0);

  return useMemo(
    () => ({
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
        showWelcomeCard: showInfoCard,
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
        clearQuery,
        applySort,
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
        toggleMine,
        clearMine,
        applyDatePreset,
        applyBrandSelection,
        clearBrands,
        applyTypeSelection,
        clearTypes,
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
        goToLogin,
        goToProfile,
        updateParams,
      },
    }),
    [
      activeBrands,
      activeDatePreset,
      activeProductTypes,
      applyBrandSelection,
      applyDatePreset,
      applySort,
      applyTypeSelection,
      brandResults,
      brandsLoading,
      clearBrands,
      clearMine,
      clearQuery,
      clearTypes,
      currentUser,
      data,
      debouncedSearchQuery,
      dismissInfoCard,
      error,
      effectivePage,
      filterUi.brandModalVisible,
      filterUi.brandSearch,
      filterUi.dateMenuVisible,
      filterUi.setBrandModalVisible,
      filterUi.setBrandSearch,
      filterUi.setDateMenuVisible,
      filterUi.setSortMenuVisible,
      filterUi.setTypeModalVisible,
      filterUi.setTypeSearch,
      filterUi.sortMenuVisible,
      filterUi.typeModalVisible,
      filterUi.typeSearch,
      header.fabExtended,
      header.headerBottom,
      header.onScroll,
      header.setHeaderBottom,
      filterMode,
      goToLogin,
      goToProfile,
      hasMore,
      isAuthenticated,
      isFetching,
      isLoading,
      newProduct,
      params,
      productList,
      refetch,
      searchQuery,
      searchQueryURL,
      setPage,
      showInfoCard,
      slowLoading,
      sortBy,
      toggleMine,
      total,
      totalPages,
      typeResults,
      typesLoading,
      updateParams,
    ],
  );
}
