import { type QueryClient, queryOptions } from '@tanstack/react-query';
import { getBaseProduct, getComponent, isProductNotFoundError } from '@/services/api/products';

/**
 * The single-product cache contract shared by `features/products` and
 * `features/cameras`, so the two need not import each other.
 */

const shouldRetry = (failureCount: number, error: unknown) => {
  if (isProductNotFoundError(error)) return false;
  return failureCount < 1;
};

export const baseProductQueryOptions = (id: number | undefined) =>
  queryOptions({
    queryKey: ['baseProduct', id ?? null] as const,
    queryFn: () => getBaseProduct(id as number),
    enabled: typeof id === 'number',
    retry: shouldRetry,
  });

export const componentQueryOptions = (id: number | undefined) =>
  queryOptions({
    queryKey: ['component', id ?? null] as const,
    queryFn: () => getComponent(id as number),
    enabled: typeof id === 'number',
    retry: shouldRetry,
  });

export function invalidateProductQuery(queryClient: QueryClient, productId: number) {
  // Camera modules don't know the product's role, so invalidate both keys.
  void queryClient.invalidateQueries({ queryKey: ['baseProduct', productId] });
  void queryClient.invalidateQueries({ queryKey: ['component', productId] });
}
