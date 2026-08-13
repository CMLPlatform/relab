import { useInfiniteQuery } from '@tanstack/react-query';
import type { useRouter } from 'expo-router';
import { useEffect, useMemo } from 'react';
import type { useAuth } from '@/context/auth';
import { FILTER_CSV_SEPARATOR } from '@/services/api/products';
import {
  DEFAULT_PRODUCT_SORT,
  PRODUCT_SORT_OPTIONS,
  productsInfiniteQueryOptions,
} from './queries';

export type ProductFilter = 'all' | 'mine';
export type RouterSetParams = Parameters<ReturnType<typeof useRouter>['setParams']>[0];
const FALLBACK_DEFAULT_SORT = Array.from(PRODUCT_SORT_OPTIONS[1].value);

export type ProductsSearchParams = {
  filterMode?: string;
  q?: string;
  sort?: string;
  brands?: string;
  types?: string;
  days?: string;
};

export function normalizeProductsParams(params: ProductsSearchParams) {
  const searchQueryURL = params.q ?? '';
  const activeDatePreset = params.days ? Number(params.days) : null;

  return {
    filterMode: (params.filterMode as ProductFilter) || 'all',
    searchQueryURL,
    sortBy: params.sort
      ? params.sort.split(',')
      : searchQueryURL
        ? []
        : Array.from(DEFAULT_PRODUCT_SORT ?? FALLBACK_DEFAULT_SORT),
    activeDatePreset,
    // Brand and type values are free user text that may contain commas, so the
    // URL round-trip uses the same separator the API layer sends.
    activeBrands: params.brands ? params.brands.split(FILTER_CSV_SEPARATOR) : [],
    activeProductTypes: params.types ? params.types.split(FILTER_CSV_SEPARATOR) : [],
  };
}

export function useProductsInfiniteListQuery({
  filterMode,
  searchQueryURL,
  sortBy,
  activeBrands,
  createdAfter,
  activeProductTypes,
}: {
  filterMode: ProductFilter;
  searchQueryURL: string;
  sortBy: string[];
  activeBrands: string[];
  createdAfter?: Date;
  activeProductTypes: string[];
}) {
  const query = useInfiniteQuery(
    productsInfiniteQueryOptions(filterMode, searchQueryURL, sortBy, {
      brands: activeBrands,
      createdAfter,
      productTypeNames: activeProductTypes,
    }),
  );

  const products = useMemo(
    () => query.data?.pages.flatMap((page) => page.items) ?? [],
    [query.data],
  );

  return {
    products,
    total: query.data?.pages.at(-1)?.total ?? 0,
    hasNextPage: query.hasNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
    fetchNextPage: query.fetchNextPage,
    isFetching: query.isFetching,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}

export function useProductsParamsSync({
  currentUser,
  debouncedSearchQuery,
  filterMode,
  searchQuery,
  searchQueryURL,
  updateParams,
}: {
  currentUser: ReturnType<typeof useAuth>['user'];
  debouncedSearchQuery: string;
  filterMode: ProductFilter;
  searchQuery: string;
  searchQueryURL: string;
  updateParams: (newParams: RouterSetParams) => void;
}) {
  useEffect(() => {
    // Only push once the debounce has settled onto the current buffer. Pushing a
    // stale in-between value would fight an external URL reset — the buffer resets
    // to the new URL while `debouncedSearchQuery` still lags, and this effect would
    // write the lagging value straight back, re-clobbering the intended ?q=.
    if (debouncedSearchQuery !== searchQuery) return;
    if (debouncedSearchQuery !== searchQueryURL) {
      updateParams({ q: debouncedSearchQuery || undefined });
    }
  }, [debouncedSearchQuery, searchQuery, searchQueryURL, updateParams]);

  useEffect(() => {
    if (!currentUser && filterMode === 'mine') {
      updateParams({ filterMode: 'all' });
    }
  }, [currentUser, filterMode, updateParams]);
}
