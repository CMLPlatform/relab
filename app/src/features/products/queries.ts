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
import { searchProductTypes } from '@/services/api/productTypes';
import { deleteProduct, MediaSyncError, saveProduct } from '@/services/api/saving';
import type { Product } from '@/types/Product';

export type ProductRole = 'product' | 'component';

// Registration key for the saveProduct mutation, shared with _layout.tsx's
// setMutationDefaults — a mutation restored from the persisted cache after a
// reload has no function attached (functions aren't serializable), so
// TanStack's persist-mutations pattern re-attaches one by this key.
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

// Page size for the infinite product list query.
const PAGE_SIZE = 24;

// ─── Query options factories ───────────────────────────────────────────────────

// The queryKey deliberately omits page — page position lives in react-query's own
// pages array, keyed off the filters, so a filter change starts a fresh cache
// entry at page 1 for free instead of needing an explicit reset.
//
// No placeholderData: carrying the previous filter's *entire* accumulated pages
// array forward while the new filter's page 1 loads would show a stale,
// multi-page-deep product list (and stale total/hasNextPage) under the new
// filter instead of resetting to a loading state.
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

export const brandsSearchQueryOptions = (search: string) =>
  queryOptions({
    queryKey: ['brands', 'search', search] as const,
    queryFn: () => searchProductBrands(search || undefined, 1, 50),
    staleTime: 2 * 60_000,
  });

export const productTypesSearchQueryOptions = (search: string) =>
  queryOptions({
    queryKey: ['productTypes', 'search', search] as const,
    queryFn: () =>
      searchProductTypes(search || undefined, 1, 50).then((items) => items.map((pt) => pt.name)),
    staleTime: 2 * 60_000,
  });

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

// ─── Save / delete mutations ───────────────────────────────────────────────────

function invalidateAfterSave(queryClient: QueryClient, product: Product, savedId: number) {
  const isComponent = product.role === 'component';
  const savedKey = isComponent
    ? componentQueryOptions(savedId).queryKey
    : baseProductQueryOptions(savedId).queryKey;
  // Invalidate the saved entity so any subsequent view loads fresh data.
  queryClient.invalidateQueries({ queryKey: savedKey });
  // Invalidate all product lists so the list reflects name/brand changes.
  queryClient.invalidateQueries({ queryKey: ['products'] });

  // For components, also refresh the parent so its components list picks up
  // the new child immediately when navigating back. Parent's role is
  // unknown at this point, so invalidate both cache entries.
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
  // Set by the caller when it initiates a create (see useProductForm /
  // useCaptureEntity) — carried in variables rather than generated here so it
  // survives both react-query's automatic retry and a paused-mutation
  // dehydrate/rehydrate cycle. Never read on the update (PATCH) path.
  idempotencyKey?: string;
};

// Exported (not just inlined in the hook below) so _layout.tsx can register it
// via queryClient.setMutationDefaults(SAVE_PRODUCT_MUTATION_KEY, { mutationFn:
// ... }) — a mutation restored from the persisted cache after a reload has no
// function attached (functions aren't serializable), so TanStack's
// persist-mutations pattern re-attaches one by mutationKey.
export const saveProductMutationFn = ({
  product,
  originalImages,
  originalVideos,
  idempotencyKey,
}: SaveProductVariables) => saveProduct(product, originalImages, originalVideos, idempotencyKey);

// Retries only failures where the request never reached the server (network
// drop, timeout — anything that isn't ApiError). ApiError means we got a real
// HTTP response, so retrying risks either repeating a rejected request for no
// reason or, worse for saveNewProduct's POST, re-creating a product the
// server already accepted. MediaSyncError is safe to retry despite not being
// an ApiError: it's thrown only after the entity POST already returned an id
// (mutated onto `product`), so a retry re-enters saveProduct as an update
// (PATCH), not a second create.
// NOTE: a response lost in flight *after* the server committed the POST is
// covered by the Idempotency-Key header saveNewProduct sends. The key is
// minted once per draft (useProductForm / useCaptureEntity) and held until a
// create succeeds, so every retry — automatic, rehydrated, or a manual second
// press of Save — replays under the same key and the server returns the
// stored response instead of writing a second record. While the first attempt
// is still committing the server answers 409 (in-flight marker), which is the
// one ApiError worth repeating: the bounded retries below wait it out.
function isRetryableSaveError(failureCount: number, error: unknown): boolean {
  if (failureCount >= 3) return false;
  if (error instanceof ApiError) return error.status === 409;
  return true;
}

// Shown on the save/create button (kept short — see FabControls/SaveBar/
// CaptureScreen) and in the one-time toast when the mutation pauses below.
// NOTE: web-only in practice today — onlineManager has no native connectivity
// listener wired yet, so a native build never reports offline and never
// pauses. See the TODO in app/_layout.tsx.
export const QUEUED_OFFLINE_LABEL = 'Queued — sends when online';

export function useSaveProductMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    // Default networkMode: 'online' — the mutation pauses while onlineManager
    // reports offline (button stays in its loading state, nothing errors or
    // drops) and fires automatically on reconnect. Callers read `isPaused` to
    // swap the eternal spinner for QUEUED_OFFLINE_LABEL.
    mutationKey: SAVE_PRODUCT_MUTATION_KEY,
    mutationFn: saveProductMutationFn,
    retry: isRetryableSaveError,

    onSuccess: (savedId, { product }) => invalidateAfterSave(queryClient, product, savedId),

    onError: (error, { product }) => {
      // A media-sync failure still wrote the entity, so the caches are stale
      // even though the mutation rejected. Without this the screen keeps showing
      // pre-save data the server no longer has.
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

      // Mirror the save mutation: refresh the parent so its components list
      // drops the deleted child immediately. Parent's role is unknown here,
      // so invalidate both cache entries.
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
