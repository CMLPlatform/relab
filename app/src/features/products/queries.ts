import {
  getBaseProduct,
  getComponent,
  isProductNotFoundError,
  products,
} from '@/services/api/products';
import { searchProductBrands } from '@/services/api/productSuggestions';
import { searchProductTypes } from '@/services/api/productTypes';
import { deleteProduct, saveProduct } from '@/services/api/saving';
import type { Product } from '@/types/Product';
import {
  type QueryClient,
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';

export type ProductRole = 'product' | 'component';

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

// ─── Query options factories ───────────────────────────────────────────────────

export const productsQueryOptions = (
  filter: 'all' | 'mine',
  page: number,
  search: string,
  sortBy: string[] = ['-created_at'],
  extra: ProductExtraFilters = {},
) =>
  queryOptions({
    queryKey: [
      'products',
      filter,
      page,
      search,
      sortBy,
      extra.brands,
      extra.createdAfter?.toISOString(),
      extra.productTypeNames,
    ] as const,
    queryFn: () =>
      products({
        page,
        size: 24,
        search: search || undefined,
        orderBy: sortBy,
        brands: extra.brands?.length ? extra.brands : undefined,
        createdAfter: extra.createdAfter,
        productTypeNames: extra.productTypeNames?.length ? extra.productTypeNames : undefined,
        ...(filter === 'mine' ? { owner: 'me' } : {}),
      }),
    placeholderData: (previousData) => previousData,
  });

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

// ─── Cache invalidation helpers ───────────────────────────────────────────────

export function invalidateProductQuery(queryClient: QueryClient, productId: number) {
  // Camera modules don't know the product's role, so invalidate both keys.
  void queryClient.invalidateQueries({ queryKey: ['baseProduct', productId] });
  void queryClient.invalidateQueries({ queryKey: ['component', productId] });
}

// ─── Save / delete mutations ───────────────────────────────────────────────────

export function useSaveProductMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      product,
      originalImages,
      originalVideos,
    }: {
      product: Product;
      originalImages: Product['images'];
      originalVideos: Product['videos'];
    }) => saveProduct(product, originalImages, originalVideos),

    onSuccess: (savedId, { product }) => {
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
