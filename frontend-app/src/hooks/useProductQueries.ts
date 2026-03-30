import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  allProducts,
  allProductTypes,
  getProduct,
  myProducts,
  searchBrands,
  searchProductTypes,
} from '@/services/api/fetching';
import { deleteProduct, saveProduct } from '@/services/api/saving';
import type { Product } from '@/types/Product';

// ─── Types ─────────────────────────────────────────────────────────────────────

export type ProductExtraFilters = {
  brands?: string[];
  createdAfter?: Date;
  productTypeNames?: string[];
};

export const PRODUCT_SORT_OPTIONS = [
  { label: 'Relevance', value: ['rank'] },
  { label: 'Newest first', value: ['-created_at'] },
  { label: 'Oldest first', value: ['created_at'] },
  { label: 'Name A→Z', value: ['name'] },
  { label: 'Name Z→A', value: ['-name'] },
  { label: 'Brand A→Z', value: ['brand'] },
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
    queryFn: () => {
      const fn = filter === 'mine' ? myProducts : allProducts;
      return fn(
        undefined,
        page,
        24,
        search || undefined,
        sortBy,
        extra.brands?.length ? extra.brands : undefined,
        extra.createdAfter,
        extra.productTypeNames?.length ? extra.productTypeNames : undefined,
      );
    },
    placeholderData: (previousData) => previousData,
  });

export const productQueryOptions = (id: number | 'new') =>
  queryOptions({
    queryKey: ['product', id] as const,
    queryFn: () => getProduct(id),
    enabled: id !== 'new',
  });

export const brandsSearchQueryOptions = (search: string) =>
  queryOptions({
    queryKey: ['brands', 'search', search] as const,
    queryFn: () => searchBrands(search || undefined, 1, 50),
    staleTime: 2 * 60_000,
  });

export const productTypesQueryOptions = () =>
  queryOptions({
    queryKey: ['productTypes'] as const,
    queryFn: allProductTypes,
    staleTime: 10 * 60_000,
  });

export const productTypesSearchQueryOptions = (search: string) =>
  queryOptions({
    queryKey: ['productTypes', 'search', search] as const,
    queryFn: () =>
      searchProductTypes(search || undefined, 1, 50).then((items) => items.map((pt) => pt.name)),
    staleTime: 2 * 60_000,
  });

// ─── Hooks ─────────────────────────────────────────────────────────────────────

export function useProductsQuery(
  filter: 'all' | 'mine',
  page: number,
  search: string,
  sortBy: string[] = ['-created_at'],
  extra: ProductExtraFilters = {},
) {
  return useQuery(productsQueryOptions(filter, page, search, sortBy, extra));
}

export function useProductQuery(id: number | 'new') {
  return useQuery(productQueryOptions(id));
}

export function useSearchBrandsQuery(search: string) {
  return useQuery(brandsSearchQueryOptions(search));
}

export function useProductTypesQuery() {
  return useQuery(productTypesQueryOptions());
}

export function useSearchProductTypesQuery(search: string) {
  return useQuery(productTypesSearchQueryOptions(search));
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
      // Invalidate the saved product so any subsequent view loads fresh data
      queryClient.invalidateQueries({ queryKey: productQueryOptions(savedId).queryKey });
      // Invalidate all product lists so the list reflects name/brand changes
      queryClient.invalidateQueries({ queryKey: ['products'] });

      // If this product is a component, also refresh its parent so the parent's
      // components list shows the new child immediately when navigating back.
      if (typeof product.parentID === 'number' && !Number.isNaN(product.parentID)) {
        queryClient.invalidateQueries({ queryKey: productQueryOptions(product.parentID).queryKey });
      }

      // If we just created a new product, also seed the cache for the new id
      if (product.id === 'new') {
        queryClient.invalidateQueries({ queryKey: productQueryOptions('new').queryKey });
      }
    },
  });
}

export function useDeleteProductMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (product: Product) => deleteProduct(product),
    onSuccess: (_data, product) => {
      if (product.id !== 'new') {
        queryClient.removeQueries({ queryKey: productQueryOptions(product.id).queryKey });
      }
      queryClient.invalidateQueries({ queryKey: ['products'] });
    },
  });
}
