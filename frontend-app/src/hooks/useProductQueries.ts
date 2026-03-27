import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  allBrands,
  allProducts,
  allProductTypes,
  getProduct,
  myProducts,
  searchBrands,
  searchProductTypes,
} from '@/services/api/fetching';
import { deleteProduct, saveProduct } from '@/services/api/saving';
import { Product } from '@/types/Product';

// ─── Query keys ────────────────────────────────────────────────────────────────

export type ProductExtraFilters = {
  brands?: string[];
  createdAfter?: Date;
  productTypeNames?: string[];
};

export const PRODUCT_SORT_OPTIONS = [
  { label: 'Newest first', value: ['-created_at'] },
  { label: 'Oldest first', value: ['created_at'] },
  { label: 'Name A→Z', value: ['name'] },
  { label: 'Name Z→A', value: ['-name'] },
  { label: 'Brand A→Z', value: ['brand'] },
  { label: 'Brand Z→A', value: ['-brand'] },
] as const;

export const DEFAULT_PRODUCT_SORT = PRODUCT_SORT_OPTIONS[0].value;

export const queryKeys = {
  products: (filter: 'all' | 'mine', page: number, search: string, sortBy: string[], extra?: ProductExtraFilters) =>
    [
      'products',
      filter,
      page,
      search,
      sortBy,
      extra?.brands,
      extra?.createdAfter?.toISOString(),
      extra?.productTypeNames,
    ] as const,
  product: (id: number | 'new') => ['product', id] as const,
  brands: () => ['brands'] as const,
  brandsSearch: (search: string) => ['brands', 'search', search] as const,
  productTypes: () => ['productTypes'] as const,
  productTypesSearch: (search: string) => ['productTypes', 'search', search] as const,
};

// ─── Products list ─────────────────────────────────────────────────────────────

export function useProductsQuery(
  filter: 'all' | 'mine',
  page: number,
  search: string,
  sortBy: string[] = ['-created_at'],
  extra: ProductExtraFilters = {},
) {
  return useQuery({
    queryKey: queryKeys.products(filter, page, search, sortBy, extra),
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
}

// ─── Single product ────────────────────────────────────────────────────────────

export function useProductQuery(id: number | 'new') {
  return useQuery({
    queryKey: queryKeys.product(id),
    queryFn: () => getProduct(id),
    enabled: id !== 'new',
  });
}

// ─── Brands ────────────────────────────────────────────────────────────────────

export function useBrandsQuery() {
  return useQuery({
    queryKey: queryKeys.brands(),
    queryFn: allBrands,
    staleTime: 5 * 60_000,
  });
}

export function useSearchBrandsQuery(search: string) {
  return useQuery({
    queryKey: queryKeys.brandsSearch(search),
    queryFn: () => searchBrands(search || undefined, 1, 50),
    staleTime: 2 * 60_000,
  });
}

// ─── Product types ─────────────────────────────────────────────────────────────

export function useProductTypesQuery() {
  return useQuery({
    queryKey: queryKeys.productTypes(),
    queryFn: allProductTypes,
    staleTime: 10 * 60_000,
  });
}

export function useSearchProductTypesQuery(search: string) {
  return useQuery({
    queryKey: queryKeys.productTypesSearch(search),
    queryFn: () => searchProductTypes(search || undefined, 1, 50).then((items) => items.map((pt) => pt.name)),
    staleTime: 2 * 60_000,
  });
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
      queryClient.invalidateQueries({ queryKey: queryKeys.product(savedId) });
      // Invalidate all product lists so the list reflects name/brand changes
      queryClient.invalidateQueries({ queryKey: ['products'] });

      // If this product is a component, also refresh its parent so the parent's
      // components list shows the new child immediately when navigating back.
      if (typeof product.parentID === 'number' && !isNaN(product.parentID)) {
        queryClient.invalidateQueries({ queryKey: queryKeys.product(product.parentID) });
      }

      // If we just created a new product, also seed the cache for the new id
      if (product.id === 'new') {
        queryClient.invalidateQueries({ queryKey: queryKeys.product('new') });
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
        queryClient.removeQueries({ queryKey: queryKeys.product(product.id) });
      }
      queryClient.invalidateQueries({ queryKey: ['products'] });
    },
  });
}
