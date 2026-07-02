import { useQueries } from '@tanstack/react-query';
import type { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { useAuth } from '@/context/auth';
import type { Product } from '@/types/Product';
import { DEFAULT_PRODUCT_SORT, PRODUCT_SORT_OPTIONS, productsQueryOptions } from './queries';

export type ProductFilter = 'all' | 'mine';
export type RouterSetParams = Parameters<ReturnType<typeof useRouter>['setParams']>[0];
const FALLBACK_DEFAULT_SORT = Array.from(PRODUCT_SORT_OPTIONS[1].value);

export type ProductsSearchParams = {
  filterMode?: string;
  q?: string;
  page?: string;
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
    page: Number(params.page) || 1,
    sortBy: params.sort
      ? params.sort.split(',')
      : searchQueryURL
        ? []
        : Array.from(DEFAULT_PRODUCT_SORT ?? FALLBACK_DEFAULT_SORT),
    activeDatePreset,
    activeBrands: params.brands ? params.brands.split(',') : [],
    activeProductTypes: params.types ? params.types.split(',') : [],
  };
}

function mergeProductPages(previous: Product[], nextPage: Product[]) {
  const existingIds = new Set(previous.map((product) => product.id));
  return [...previous, ...nextPage.filter((product) => !existingIds.has(product.id))];
}

export function useProductsPaging({
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

export function useProductsListQuery({
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
    () =>
      numColumns === 1
        ? Array.from({ length: effectivePage }, (_, index) => index + 1)
        : [effectivePage],
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

export function useProductsParamsSync({
  currentUser,
  debouncedSearchQuery,
  filterMode,
  searchQueryURL,
  updateParams,
}: {
  currentUser: ReturnType<typeof useAuth>['user'];
  debouncedSearchQuery: string;
  filterMode: ProductFilter;
  searchQueryURL: string;
  updateParams: (newParams: RouterSetParams) => void;
}) {
  useEffect(() => {
    if (debouncedSearchQuery !== searchQueryURL) {
      updateParams({ q: debouncedSearchQuery || undefined, page: '1' });
    }
  }, [debouncedSearchQuery, searchQueryURL, updateParams]);

  useEffect(() => {
    if (!currentUser && filterMode === 'mine') {
      updateParams({ filterMode: 'all', page: '1' });
    }
  }, [currentUser, filterMode, updateParams]);
}
