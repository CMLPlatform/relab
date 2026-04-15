import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import { useDebounce } from 'use-debounce';
import { useDialog } from '@/components/common/DialogProvider';
import { useAuth } from '@/context/AuthProvider';
import { useNewProductAction } from '@/hooks/products/useNewProductAction';
import { useProductsWelcomeCard } from '@/hooks/products/useProductsWelcomeCard';
import {
  DEFAULT_PRODUCT_SORT,
  PRODUCT_SORT_OPTIONS,
  useProductsQuery,
  useSearchBrandsQuery,
  useSearchProductTypesQuery,
} from '@/hooks/useProductQueries';
import type { Product } from '@/types/Product';

export type ProductFilter = 'all' | 'mine';
type RouterSetParams = Parameters<ReturnType<typeof useRouter>['setParams']>[0];
type TimerWithUnref = ReturnType<typeof setTimeout> & { unref(): void };
const FALLBACK_DEFAULT_SORT = Array.from(PRODUCT_SORT_OPTIONS[1].value);

export function useProductsScreen(numColumns: number) {
  const dialog = useDialog();
  const router = useRouter();
  const { user: currentUser, refetch: refetchUser } = useAuth();
  const params = useLocalSearchParams<{
    filterMode?: string;
    q?: string;
    page?: string;
    sort?: string;
    brands?: string;
    types?: string;
    days?: string;
  }>();

  const filterMode = (params.filterMode as ProductFilter) || 'all';
  const searchQueryURL = params.q || '';
  const page = Number(params.page) || 1;
  const sortBy = params.sort
    ? params.sort.split(',')
    : searchQueryURL
      ? (['rank'] as string[])
      : Array.from(DEFAULT_PRODUCT_SORT ?? FALLBACK_DEFAULT_SORT);
  const activeDatePreset = params.days ? Number(params.days) : null;
  const activeBrands = params.brands ? params.brands.split(',') : [];
  const activeProductTypes = params.types ? params.types.split(',') : [];
  const createdAfter = useMemo(() => {
    if (!activeDatePreset) return undefined;
    return new Date(Date.now() - activeDatePreset * 86_400_000);
  }, [activeDatePreset]);

  const [searchQuery, setSearchQuery] = useState(searchQueryURL);
  const [debouncedSearchQuery] = useDebounce(searchQuery, 500);
  const [mobilePage, setMobilePage] = useState(1);
  const effectivePage = numColumns === 1 ? mobilePage : page;
  const [headerBottom, setHeaderBottom] = useState(0);
  const [fabExtended, setFabExtended] = useState(true);
  const [accumulatedProducts, setAccumulatedProducts] = useState<Product[]>([]);
  const [sortMenuVisible, setSortMenuVisible] = useState(false);
  const [dateMenuVisible, setDateMenuVisible] = useState(false);
  const [brandModalVisible, setBrandModalVisible] = useState(false);
  const [typeModalVisible, setTypeModalVisible] = useState(false);
  const [brandSearch, setBrandSearch] = useState('');
  const [typeSearch, setTypeSearch] = useState('');
  const [slowLoading, setSlowLoading] = useState(false);
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

  const { data: brandResults, isLoading: brandsLoading } = useSearchBrandsQuery(brandSearch);
  const { data: typeResults, isLoading: typesLoading } = useSearchProductTypesQuery(typeSearch);

  useEffect(() => {
    if (!currentUser && filterMode === 'mine') {
      updateParams({ filterMode: 'all', page: '1' });
    }
  }, [currentUser, filterMode, updateParams]);

  const { data, isFetching, isLoading, error, refetch } = useProductsQuery(
    filterMode,
    effectivePage,
    searchQueryURL,
    sortBy,
    { brands: activeBrands, createdAfter, productTypeNames: activeProductTypes },
  );
  const resetAccumulationKey = JSON.stringify([
    searchQueryURL,
    filterMode,
    activeDatePreset,
    params.brands,
    params.types,
    params.sort,
  ]);

  useEffect(() => {
    if (!isLoading) {
      setSlowLoading(false);
      return;
    }
    const timer = setTimeout(() => setSlowLoading(true), 5000);
    if (timer && typeof timer === 'object' && 'unref' in timer) {
      (timer as TimerWithUnref).unref();
    }
    return () => clearTimeout(timer);
  }, [isLoading]);

  useEffect(() => {
    void resetAccumulationKey;
    setMobilePage(1);
    setAccumulatedProducts([]);
  }, [resetAccumulationKey]);

  useEffect(() => {
    if (!data?.items) return;
    if (data.page !== effectivePage) return;
    if (effectivePage === 1) {
      setAccumulatedProducts(data.items);
      return;
    }
    setAccumulatedProducts((prev) => {
      const existingIds = new Set(prev.map((p) => p.id));
      return [...prev, ...data.items.filter((p) => !existingIds.has(p.id))];
    });
  }, [data, effectivePage]);
  const { showInfoCard, dismissInfoCard } = useProductsWelcomeCard({
    isAuthenticated,
    currentUser,
    refetchUser,
  });

  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    setFabExtended(event.nativeEvent.contentOffset.y <= 0);
  };

  const productList = numColumns === 1 ? accumulatedProducts : (data?.items ?? []);
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
      headerBottom,
      fabExtended,
      showWelcomeCard: showInfoCard,
      slowLoading,
    },
    search: {
      query: searchQuery,
      queryFromUrl: searchQueryURL,
      debouncedQuery: debouncedSearchQuery,
      sortBy,
      sortMenuVisible,
      setQuery: setSearchQuery,
      setSortMenuVisible,
      clearQuery: () => updateParams({ q: undefined, page: '1' }),
      applySort: (sort: readonly string[]) => updateParams({ sort: sort.join(','), page: '1' }),
    },
    filters: {
      brandResults,
      brandsLoading,
      typeResults,
      typesLoading,
      dateMenuVisible,
      brandModalVisible,
      typeModalVisible,
      brandSearch,
      typeSearch,
      setDateMenuVisible,
      setBrandModalVisible,
      setTypeModalVisible,
      setBrandSearch,
      setTypeSearch,
      toggleMine: () =>
        updateParams({ filterMode: filterMode === 'mine' ? 'all' : 'mine', page: '1' }),
      clearMine: () => updateParams({ filterMode: 'all', page: '1' }),
      applyDatePreset: (days: string | undefined) => updateParams({ days, page: '1' }),
      applyBrandSelection: (values: string[]) =>
        updateParams({ brands: values.length ? values.join(',') : undefined, page: '1' }),
      clearBrands: () => updateParams({ brands: undefined, page: '1' }),
      applyTypeSelection: (values: string[]) =>
        updateParams({ types: values.length ? values.join(',') : undefined, page: '1' }),
      clearTypes: () => updateParams({ types: undefined, page: '1' }),
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
      onScroll,
      setHeaderBottom,
      setPage: (nextPage: number) =>
        numColumns === 1 ? setMobilePage(nextPage) : updateParams({ page: String(nextPage) }),
    },
    actions: {
      dismissWelcomeCard: dismissInfoCard,
      createProduct: newProduct,
      goToLogin: () => router.push('/login'),
      goToProfile: () => router.push('/profile'),
      updateParams,
    },
  };
}
