import { type QueryClient, queryOptions } from '@tanstack/react-query';
import { getBaseProduct, getComponent, isProductNotFoundError } from '@/services/api/products';

/**
 * The single-product cache contract, owned by neither `features/products` nor
 * `features/cameras`.
 *
 * Cameras write into the product cache (a capture or a stream changes a
 * product's media) while products read camera state, so parking these here
 * keeps that from being a two-way dependency between the two features.
 * Product-list queries, forms and mutations stay in `features/products`; only
 * what cameras also need lives here.
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
