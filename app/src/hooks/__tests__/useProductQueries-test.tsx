import { describe, expect, it, jest } from '@jest/globals';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import type React from 'react';
import { searchProductBrands } from '@/services/api/productSuggestions';
import {
  allProducts,
  getBaseProduct,
  getComponent,
  myProducts,
  ProductNotFoundError,
} from '@/services/api/products';
import { allProductTypes, searchProductTypes } from '@/services/api/productTypes';
import { deleteProduct, saveProduct } from '@/services/api/saving';
import type { Product } from '@/types/Product';
import {
  useBaseProductQuery,
  useComponentQuery,
  useDeleteProductMutation,
  useProductsQuery,
  useProductTypesQuery,
  useSaveProductMutation,
  useSearchBrandsQuery,
  useSearchProductTypesQuery,
} from '../useProductQueries';

jest.mock('@/services/api/productSuggestions', () => ({
  allProductBrands: jest.fn(),
  searchProductBrands: jest.fn(),
}));

type ProductsModule = typeof import('@/services/api/products');

jest.mock('@/services/api/products', () => {
  const actual = jest.requireActual('@/services/api/products') as ProductsModule;
  return {
    ...actual,
    allProducts: jest.fn(),
    getBaseProduct: jest.fn(),
    getComponent: jest.fn(),
    myProducts: jest.fn(),
  };
});

jest.mock('@/services/api/productTypes', () => ({
  allProductTypes: jest.fn(),
  searchProductTypes: jest.fn(),
}));

jest.mock('@/services/api/saving', () => ({
  saveProduct: jest.fn(),
  deleteProduct: jest.fn(),
}));

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
});

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
);

describe('useProductQueries', () => {
  const mockedAllProducts = jest.mocked(allProducts);
  const mockedMyProducts = jest.mocked(myProducts);
  const mockedSearchBrands = jest.mocked(searchProductBrands);
  const mockedSearchProductTypes = jest.mocked(searchProductTypes);
  const mockedAllProductTypes = jest.mocked(allProductTypes);
  const mockedGetBaseProduct = jest.mocked(getBaseProduct);
  const mockedGetComponent = jest.mocked(getComponent);
  const mockedSaveProduct = jest.mocked(saveProduct);
  const mockedDeleteProduct = jest.mocked(deleteProduct);
  const existingProduct: Product = {
    id: 123,
    role: 'product',
    name: 'Test',
    componentIDs: [],
    components: [],
    physicalProperties: { weight: 0, width: 0, height: 0, depth: 0 },
    circularityProperties: {
      recyclability: null,
      disassemblability: null,
      remanufacturability: null,
    },
    images: [],
    videos: [],
    ownedBy: 'me',
  };
  const newProductDraft: Product = {
    id: undefined,
    role: 'product',
    name: 'Draft',
    componentIDs: [],
    components: [],
    physicalProperties: { weight: 0, width: 0, height: 0, depth: 0 },
    circularityProperties: {
      recyclability: null,
      disassemblability: null,
      remanufacturability: null,
    },
    images: [],
    videos: [],
    ownedBy: 'me',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    queryClient.clear();
  });

  it('useProductsQuery calls allProducts by default', async () => {
    const mockData = { items: [], total: 0, page: 1, pages: 1, size: 24 };
    mockedAllProducts.mockResolvedValue(mockData);

    const { result } = renderHook(() => useProductsQuery('all', 1, ''), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(allProducts).toHaveBeenCalled();
    expect(result.current.data).toEqual(mockData);
  });

  it('useProductsQuery calls myProducts for "mine" filter', async () => {
    const mockData = { items: [], total: 0, page: 1, pages: 1, size: 24 };
    mockedMyProducts.mockResolvedValue(mockData);

    const { result } = renderHook(() => useProductsQuery('mine', 1, ''), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(myProducts).toHaveBeenCalled();
  });

  it('useProductsQuery forwards extra filters and search params', async () => {
    const mockData = { items: [], total: 0, page: 2, pages: 3, size: 24 };
    const createdAfter = new Date('2026-01-02T03:04:05.000Z');
    mockedAllProducts.mockResolvedValue(mockData);

    renderHook(
      () =>
        useProductsQuery('all', 2, 'lamp', ['+name'], {
          brands: ['ikea', 'philips'],
          createdAfter,
          productTypeNames: ['Furniture'],
        }),
      { wrapper },
    );

    await waitFor(() => expect(allProducts).toHaveBeenCalled());
    expect(allProducts).toHaveBeenCalledWith(
      2,
      24,
      'lamp',
      ['+name'],
      ['ikea', 'philips'],
      createdAfter,
      ['Furniture'],
    );
  });

  it('search queries pass undefined for empty searches', async () => {
    mockedSearchBrands.mockResolvedValue([]);
    mockedSearchProductTypes.mockResolvedValue([]);

    renderHook(() => useSearchBrandsQuery(''), { wrapper });
    renderHook(() => useSearchProductTypesQuery(''), { wrapper });

    await waitFor(() => expect(searchProductBrands).toHaveBeenCalled());
    expect(searchProductBrands).toHaveBeenCalledWith(undefined, 1, 50);
    expect(searchProductTypes).toHaveBeenCalledWith(undefined, 1, 50);
  });

  it('useProductTypesQuery calls allProductTypes', async () => {
    mockedAllProductTypes.mockResolvedValue([]);

    const { result } = renderHook(() => useProductTypesQuery(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(allProductTypes).toHaveBeenCalled();
  });

  it('useBaseProductQuery calls getBaseProduct and respects enabled state', async () => {
    mockedGetBaseProduct.mockResolvedValue(existingProduct);

    const { result, rerender } = renderHook<
      ReturnType<typeof useBaseProductQuery>,
      { id: number | undefined }
    >(({ id }: { id: number | undefined }) => useBaseProductQuery(id), {
      wrapper,
      initialProps: { id: undefined },
    });

    expect(result.current.isLoading).toBe(false);
    expect(getBaseProduct).not.toHaveBeenCalled();

    rerender({ id: 123 });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getBaseProduct).toHaveBeenCalledWith(123);
  });

  it('useComponentQuery calls getComponent and respects enabled state', async () => {
    mockedGetComponent.mockResolvedValue(existingProduct);

    const { result, rerender } = renderHook<
      ReturnType<typeof useComponentQuery>,
      { id: number | undefined }
    >(({ id }: { id: number | undefined }) => useComponentQuery(id), {
      wrapper,
      initialProps: { id: undefined },
    });

    expect(result.current.isLoading).toBe(false);
    expect(getComponent).not.toHaveBeenCalled();

    rerender({ id: 77 });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getComponent).toHaveBeenCalledWith(77);
  });

  it('useBaseProductQuery does not retry when the product is missing', async () => {
    mockedGetBaseProduct.mockRejectedValue(new ProductNotFoundError(123));

    const { result } = renderHook(() => useBaseProductQuery(123), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(getBaseProduct).toHaveBeenCalledTimes(1);
  });

  it('useSaveProductMutation invalidates the base-product cache for a saved product', async () => {
    const mockSavedId = 456;
    mockedSaveProduct.mockResolvedValue(mockSavedId);
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useSaveProductMutation(), { wrapper });

    result.current.mutate({
      product: { ...newProductDraft, name: 'New' },
      originalImages: [],
      originalVideos: [],
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(saveProduct).toHaveBeenCalled();
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ['baseProduct', mockSavedId] }),
    );
    expect(invalidateSpy).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ['products'] }));
  });

  it('useSaveProductMutation invalidates the component cache and the parent when saving a component', async () => {
    mockedSaveProduct.mockResolvedValue(789);
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useSaveProductMutation(), { wrapper });

    result.current.mutate({
      product: { ...newProductDraft, role: 'component', name: 'Child', parentID: 321 },
      originalImages: [],
      originalVideos: [],
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ['component', 789] }),
    );
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ['baseProduct', 321] }),
    );
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ['component', 321] }),
    );
  });

  it('useDeleteProductMutation removes both role caches for an existing entity', async () => {
    mockedDeleteProduct.mockResolvedValue(undefined);
    const removeSpy = jest.spyOn(queryClient, 'removeQueries');
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useDeleteProductMutation(), { wrapper });

    result.current.mutate({ ...existingProduct, id: 123, name: 'Old' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(removeSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ['baseProduct', 123] }),
    );
    expect(removeSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ['component', 123] }),
    );
    expect(invalidateSpy).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ['products'] }));
  });
});
