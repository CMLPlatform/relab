import {
  infiniteQueryOptions,
  type QueryClient,
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { baseProductQueryOptions, componentQueryOptions } from '@/features/product-entity/queries';
import { ApiError } from '@/services/api/errors';
import { searchProductBrands } from '@/services/api/productSuggestions';
import { products } from '@/services/api/products';
import { fetchProductTypesByName, searchProductTypes } from '@/services/api/productTypes';
import { deleteProduct, MediaSyncError, saveProduct } from '@/services/api/saving';
import { fetchTopCategories } from '@/services/api/stats';
import type { Product } from '@/types/Product';

export type ProductRole = 'product' | 'component';

// Shared with _layout.tsx's setMutationDefaults: a mutation restored from the
// persisted cache has no function attached, so TanStack re-attaches one by key.
export const SAVE_PRODUCT_MUTATION_KEY = ['saveProduct'] as const;

// ─── Types ─────────────────────────────────────────────────────────────────────

export type ProductExtraFilters = {
  brands?: string[];
  createdAfter?: Date;
  productTypeNames?: string[];
};

export const PRODUCT_SORT_OPTIONS = [
  { label: 'Relevance', value: [] },
  { label: 'Newest first', value: ['-created_at'] },
  { label: 'Oldest first', value: ['+created_at'] },
  { label: 'Name A→Z', value: ['+name'] },
  { label: 'Name Z→A', value: ['-name'] },
  { label: 'Brand A→Z', value: ['+brand'] },
  { label: 'Brand Z→A', value: ['-brand'] },
] as const;

export const DEFAULT_PRODUCT_SORT = PRODUCT_SORT_OPTIONS[1].value; // Newest first when not searching

const PAGE_SIZE = 24;

// ─── Query options factories ───────────────────────────────────────────────────

// No placeholderData: it would carry the previous filter's whole pages array
// (and stale total/hasNextPage) under the new filter while page 1 loads.
export const productsInfiniteQueryOptions = (
  filter: 'all' | 'mine',
  search: string,
  sortBy: string[] = ['-created_at'],
  extra: ProductExtraFilters = {},
) =>
  infiniteQueryOptions({
    queryKey: [
      'products',
      'infinite',
      filter,
      search,
      sortBy,
      extra.brands,
      extra.createdAfter?.toISOString(),
      extra.productTypeNames,
    ] as const,
    queryFn: ({ pageParam }) =>
      products({
        page: pageParam,
        size: PAGE_SIZE,
        search: search || undefined,
        orderBy: sortBy,
        brands: extra.brands?.length ? extra.brands : undefined,
        createdAfter: extra.createdAfter,
        productTypeNames: extra.productTypeNames?.length ? extra.productTypeNames : undefined,
        ...(filter === 'mine' ? { owner: 'me' } : {}),
      }),
    initialPageParam: 1,
    getNextPageParam: (lastPage, _pages, lastPageParam) =>
      lastPageParam * PAGE_SIZE < lastPage.total ? lastPageParam + 1 : undefined,
  });

/** A user's public products for /users/[username]; the server 404s hidden profiles. */
export const userProductsInfiniteQueryOptions = (username: string) =>
  infiniteQueryOptions({
    queryKey: ['products', 'infinite', 'user', username] as const,
    queryFn: ({ pageParam }) =>
      products({
        page: pageParam,
        size: PAGE_SIZE,
        orderBy: [...DEFAULT_PRODUCT_SORT],
        owner: username,
      }),
    initialPageParam: 1,
    getNextPageParam: (lastPage, _pages, lastPageParam) =>
      lastPageParam * PAGE_SIZE < lastPage.total ? lastPageParam + 1 : undefined,
  });

export const brandsSearchQueryOptions = (search: string) =>
  queryOptions({
    queryKey: ['brands', 'search', search] as const,
    queryFn: () => searchProductBrands(search || undefined, 1, 50),
    staleTime: 2 * 60_000,
  });

// A CPV-imported type's `name` is its code; the label lives in `description`.
export const productTypesSearchQueryOptions = (search: string) =>
  queryOptions({
    queryKey: ['productTypes', 'search', search] as const,
    queryFn: () => searchProductTypes(search || undefined, 1, 50),
    staleTime: 2 * 60_000,
  });

/** The most-used product types, for the picker's "Common types" shortcut. */
export const topCategoriesQueryOptions = queryOptions({
  queryKey: ['stats', 'categories', 'all'] as const,
  queryFn: () => fetchTopCategories(10),
  // Usage counts drift slowly; one stale hour saves a request per picker open.
  staleTime: 60 * 60_000,
});

/** Labels for product types already selected as filters (they arrive from the URL on a cold load). */
export const productTypeLabelsQueryOptions = (names: string[]) => {
  const key = [...names].sort();
  return queryOptions({
    queryKey: ['productTypes', 'labels', key] as const,
    queryFn: () => fetchProductTypesByName(key),
    enabled: key.length > 0,
    staleTime: 10 * 60_000,
  });
};

// ─── Hooks ─────────────────────────────────────────────────────────────────────

export function useBaseProductQuery(id: number | undefined) {
  return useQuery(baseProductQueryOptions(id));
}

export function useComponentQuery(id: number | undefined) {
  return useQuery(componentQueryOptions(id));
}

export function useSearchBrandsQuery(search: string) {
  return useQuery(brandsSearchQueryOptions(search));
}

export function useSearchProductTypesQuery(search: string) {
  return useQuery(productTypesSearchQueryOptions(search));
}

export function useProductTypeLabelsQuery(names: string[]) {
  return useQuery(productTypeLabelsQueryOptions(names));
}

// ─── Save / delete mutations ───────────────────────────────────────────────────

function invalidateAfterSave(queryClient: QueryClient, product: Product, savedId: number) {
  const isComponent = product.role === 'component';
  const savedKey = isComponent
    ? componentQueryOptions(savedId).queryKey
    : baseProductQueryOptions(savedId).queryKey;
  queryClient.invalidateQueries({ queryKey: savedKey });
  queryClient.invalidateQueries({ queryKey: ['products'] });

  // Refresh the parent's components list. Its role is unknown here, so
  // invalidate both cache entries.
  if (isComponent && typeof product.parentID === 'number') {
    queryClient.invalidateQueries({
      queryKey: baseProductQueryOptions(product.parentID).queryKey,
    });
    queryClient.invalidateQueries({
      queryKey: componentQueryOptions(product.parentID).queryKey,
    });
  }
}

export type SaveProductVariables = {
  product: Product;
  originalImages: Product['images'];
  originalVideos: Product['videos'];
  // Minted by the caller on create (useProductForm / useCaptureEntity) so it
  // survives retries and a dehydrate/rehydrate cycle. Unused on the PATCH path.
  idempotencyKey?: string;
};

// Exported so _layout.tsx can register it via setMutationDefaults (see
// SAVE_PRODUCT_MUTATION_KEY).
export const saveProductMutationFn = ({
  product,
  originalImages,
  originalVideos,
  idempotencyKey,
}: SaveProductVariables) => saveProduct(product, originalImages, originalVideos, idempotencyKey);

// Retry only when the request never reached the server (anything that is not
// an ApiError), plus 409: the server's in-flight marker while a first attempt
// under the same Idempotency-Key is still committing. MediaSyncError is safe to
// retry: the entity POST already returned an id (mutated onto `product`), so
// the retry re-enters saveProduct as a PATCH.
function isRetryableSaveError(failureCount: number, error: unknown): boolean {
  if (failureCount >= 3) return false;
  if (error instanceof ApiError) return error.status === 409;
  return true;
}

// Shown on the save/create button and in the toast when the mutation pauses.
// NOTE: web-only in practice; onlineManager has no native connectivity
// listener yet, so a native build never pauses. See the TODO in app/_layout.tsx.
export const QUEUED_OFFLINE_LABEL = 'Queued — sends when online';

export function useSaveProductMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    // Default networkMode 'online': the mutation pauses while offline and
    // fires on reconnect. Callers read `isPaused` to show QUEUED_OFFLINE_LABEL.
    mutationKey: SAVE_PRODUCT_MUTATION_KEY,
    mutationFn: saveProductMutationFn,
    retry: isRetryableSaveError,

    onSuccess: (savedId, { product }) => invalidateAfterSave(queryClient, product, savedId),

    onError: (error, { product }) => {
      // A media-sync failure still wrote the entity, so the caches are stale.
      if (error instanceof MediaSyncError) {
        invalidateAfterSave(queryClient, product, error.productId);
      }
    },
  });
}

export function useDeleteProductMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (product: Product) => deleteProduct(product),
    onSuccess: (_data, product) => {
      if (typeof product.id === 'number') {
        queryClient.removeQueries({ queryKey: baseProductQueryOptions(product.id).queryKey });
        queryClient.removeQueries({ queryKey: componentQueryOptions(product.id).queryKey });
      }
      queryClient.invalidateQueries({ queryKey: ['products'] });

      // Refresh the parent's components list; its role is unknown, so
      // invalidate both cache entries.
      if (product.role === 'component' && typeof product.parentID === 'number') {
        queryClient.invalidateQueries({
          queryKey: baseProductQueryOptions(product.parentID).queryKey,
        });
        queryClient.invalidateQueries({
          queryKey: componentQueryOptions(product.parentID).queryKey,
        });
      }
    },
  });
}
