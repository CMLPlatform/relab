import {
  infiniteQueryOptions,
  type QueryClient,
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useEffect } from 'react';
import { useDialog } from '@/components/base/dialogContext';
import { baseProductQueryOptions, componentQueryOptions } from '@/features/product-entity/queries';
import { ApiError } from '@/services/api/errors';
import { type ProductsQuery, products } from '@/services/api/products';
import {
  fetchProductTypesByName,
  searchProductBrands,
  searchProductTypes,
} from '@/services/api/productTypes';
import { deleteProduct, isEditConflict, MediaSyncError, saveProduct } from '@/services/api/saving';
import { fetchTopCategories } from '@/services/api/stats';
import type { Product } from '@/types/Product';
import { getErrorMessage } from '@/utils/errors';

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
/** The list's filters as an API query, shared by the list and "Export results". */
export function productsListQuery(
  filter: 'all' | 'mine',
  search: string,
  sortBy: string[],
  extra: ProductExtraFilters = {},
): ProductsQuery {
  return {
    search: search || undefined,
    orderBy: sortBy,
    brands: extra.brands?.length ? extra.brands : undefined,
    createdAfter: extra.createdAfter,
    productTypeNames: extra.productTypeNames?.length ? extra.productTypeNames : undefined,
    ...(filter === 'mine' ? { owner: 'me' } : {}),
  };
}

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
        ...productsListQuery(filter, search, sortBy, extra),
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

// An upload answers as soon as its narrow thumbnail exists; the API generates
// the wider derivatives just afterwards. Long enough to clear that, short
// enough that a reviewer scrolling straight into the full-screen viewer has
// them.
const DERIVATIVE_REFETCH_DELAY_MS = 2_000;

/** Whether this save uploaded an image, so wider derivatives are still being generated. */
function savedANewImage(product: Product, originalImages: Product['images']): boolean {
  const before = originalImages ?? [];
  return (product.images ?? []).some(
    (image) => !before.some((original) => original.id === image.id),
  );
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

// A save restored from the persisted cache after a restart has no screen
// awaiting it, so its failure is announced here. Screens' own saves never
// reach this: useSaveProductMutation's onError replaces the default one.
let resumedSaveDialog: Pick<ReturnType<typeof useDialog>, 'alert' | 'toast'> | undefined;

/** Registers the dialog that announces a failed resumed save. Mount once, under DialogProvider. */
export function ResumedSaveNotice() {
  const { alert, toast } = useDialog();
  useEffect(() => {
    resumedSaveDialog = { alert, toast };
    return () => {
      resumedSaveDialog = undefined;
    };
  }, [alert, toast]);
  return null;
}

/** Signing out cleared saves or creates still queued offline: say how many were lost. */
export function announceDiscardedQueuedItems(count: number) {
  resumedSaveDialog?.alert({
    title: 'Queued items discarded',
    message: `${count} ${count === 1 ? 'item' : 'items'} waiting to send ${count === 1 ? 'was' : 'were'} discarded because you were signed out.`,
    buttons: [{ text: 'OK' }],
  });
}

/** Default onError for restored saves: say which item failed and how. */
export function onResumedSaveError(queryClient: QueryClient) {
  return (error: unknown, { product }: SaveProductVariables) => {
    // A queued create whose form was cleared long ago: an alert, not a toast,
    // so the lost observation cannot pass unseen.
    if (typeof product.id !== 'number') {
      resumedSaveDialog?.alert({
        title: 'Create failed',
        message: `"${product.name}" was not created. ${getErrorMessage(error, 'Please capture it again.')}`,
        buttons: [{ text: 'OK' }],
      });
      return;
    }
    if (error instanceof MediaSyncError) {
      invalidateAfterSave(queryClient, product, error.productId);
      resumedSaveDialog?.alert({
        title: 'Upload failed',
        message: `"${product.name}" was saved, but some photos failed to upload. Open it to add them again.`,
        buttons: [{ text: 'OK' }],
      });
      return;
    }
    if (!isEditConflict(error)) return;
    invalidateAfterSave(queryClient, product, product.id);
    resumedSaveDialog?.toast(
      `"${product.name}" changed elsewhere while your edit waited to send, so the edit was not saved.`,
    );
  };
}

// Shown on the save/create button and in the toast when the mutation pauses.
export const QUEUED_OFFLINE_LABEL = 'Queued — sends when online';

export function useSaveProductMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    // Default networkMode 'online': the mutation pauses while offline and
    // fires on reconnect. Callers read `isPaused` to show QUEUED_OFFLINE_LABEL.
    mutationKey: SAVE_PRODUCT_MUTATION_KEY,
    // Every save PATCHes the whole record, so two in flight at once let the
    // slower one overwrite the newer one's fields. A scope makes react-query
    // run them FIFO, so send order is apply order and the last (most complete)
    // snapshot wins. mutationKey alone does not serialize: the cache keys
    // strictly on `scope.id`.
    scope: { id: 'saveProduct' },
    mutationFn: saveProductMutationFn,
    retry: isRetryableSaveError,

    onSuccess: (savedId, { product, originalImages }) => {
      invalidateAfterSave(queryClient, product, savedId);
      // The refetch above runs while the wider derivatives are still being
      // generated, so it brings back the narrow width alone and the full-screen
      // viewer stretches it. One late re-ask picks the rest up.
      // NOTE: a single re-ask, not a poll; if generation ever outruns the delay,
      // refetch until the expected widths are present instead.
      if (savedANewImage(product, originalImages)) {
        setTimeout(
          () => invalidateAfterSave(queryClient, product, savedId),
          DERIVATIVE_REFETCH_DELAY_MS,
        );
      }
    },

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
    // NOTE: 'always', unlike saves: a delete never pauses offline. A queued
    // delete would land long after the person moved on, and a failure then
    // would have no screen to report to. Offline or on a dropped connection the
    // request fails at once and the caller shows the connection error.
    networkMode: 'always',
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
