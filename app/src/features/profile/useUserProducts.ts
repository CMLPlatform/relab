import { useInfiniteQuery } from '@tanstack/react-query';
import { useCallback } from 'react';
import { userProductsInfiniteQueryOptions } from '@/features/products/queries';

/** One public profile's products, flattened across pages, plus the next-page trigger. */
export function useUserProducts(username: string) {
  const { data, isLoading, isFetchingNextPage, hasNextPage, fetchNextPage } = useInfiniteQuery(
    userProductsInfiniteQueryOptions(username),
  );
  const loadMore = useCallback(() => {
    void fetchNextPage();
  }, [fetchNextPage]);

  return {
    items: data?.pages.flatMap((page) => page.items) ?? [],
    total: data?.pages[0]?.total ?? 0,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    loadMore,
  };
}
