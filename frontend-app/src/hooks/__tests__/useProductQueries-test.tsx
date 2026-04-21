import { describe, expect, it, jest } from '@jest/globals';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import type React from 'react';
import { searchBrands } from '@/services/api/brands';
import { allProducts, getProduct, myProducts, ProductNotFoundError } from '@/services/api/products';
import { allProductTypes, searchProductTypes } from '@/services/api/productTypes';
import { deleteProduct, saveProduct } from '@/services/api/saving';
import type { Product } from '@/types/Product';
import {
  useDeleteProductMutation,
  useProductQuery,
  useProductsQuery,
  useProductTypesQuery,
  useSaveProductMutation,
  useSearchBrandsQuery,
  useSearchProductTypesQuery,
} from '../useProductQueries';

jest.mock('@/services/api/brands', () => ({
  allBrands: jest.fn(),
  searchBrands: jest.fn(),
}));

type ProductsModule = typeof import('@/services/api/products');

jest.mock('@/services/api/products', () => {
  const actual = jest.requireActual('@/services/api/products') as ProductsModule;
  return {
    ...actual,
    allProducts: jest.fn(),
    getProduct: jest.fn(),
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

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: query-hook coverage relies on one shared API mocking harness.
describe('useProductQueries', () => {
  const mockedAllProducts = jest.mocked(allProducts);
  const mockedMyProducts = jest.mocked(myProducts);
  const mockedSearchBrands = jest.mocked(searchBrands);
  const mockedSearchProductTypes = jest.mocked(searchProductTypes);
  const mockedAllProductTypes = jest.mocked(allProductTypes);
  const mockedGetProduct = jest.mocked(getProduct);
  const mockedSaveProduct = jest.mocked(saveProduct);
  const mockedDeleteProduct = jest.mocked(deleteProduct);
  const existingProduct: Product = {
    id: 123,
    name: 'Test',
    componentIDs: [],
    physicalProperties: { weight: 0, width: 0, height: 0, depth: 0 },
    circularityProperties: {
      recyclabilityObservation: '',
      remanufacturabilityObservation: '',
      repairabilityObservation: '',
    },
    images: [],
    videos: [],
    ownedBy: 'me',
  };
  const newProductDraft: Product = {
    id: 'new',
    name: 'Draft',
    componentIDs: [],
    physicalProperties: { weight: 0, width: 0, height: 0, depth: 0 },
    circularityProperties: {
      recyclabilityObservation: '',
      remanufacturabilityObservation: '',
      repairabilityObservation: '',
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
        useProductsQuery('all', 2, 'lamp', ['name'], {
          brands: ['ikea', 'philips'],
          createdAfter,
          productTypeNames: ['Furniture'],
        }),
      { wrapper },
    );

    await waitFor(() => expect(allProducts).toHaveBeenCalled());
    expect(allProducts).toHaveBeenCalledWith(
      undefined,
      2,
      24,
      'lamp',
      ['name'],
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

    await waitFor(() => expect(searchBrands).toHaveBeenCalled());
    expect(searchBrands).toHaveBeenCalledWith(undefined, 1, 50);
    expect(searchProductTypes).toHaveBeenCalledWith(undefined, 1, 50);
  });

  it('useProductTypesQuery calls allProductTypes', async () => {
    mockedAllProductTypes.mockResolvedValue([]);

    const { result } = renderHook(() => useProductTypesQuery(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(allProductTypes).toHaveBeenCalled();
  });

  it('useProductQuery calls getProduct and respects enabled state', async () => {
    mockedGetProduct.mockResolvedValue(existingProduct);

    const { result, rerender } = renderHook<
      ReturnType<typeof useProductQuery>,
      { id: number | 'new' }
    >(({ id }: { id: number | 'new' }) => useProductQuery(id), {
      wrapper,
      initialProps: { id: 'new' },
    });

    // Should not run for 'new'
    expect(result.current.isLoading).toBe(false);
    expect(getProduct).not.toHaveBeenCalled();

    rerender({ id: 123 });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getProduct).toHaveBeenCalledWith(123);
  });

  it('useProductQuery does not retry when the product is missing', async () => {
    mockedGetProduct.mockRejectedValue(new ProductNotFoundError(123));

    const { result } = renderHook(() => useProductQuery(123), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(getProduct).toHaveBeenCalledTimes(1);
  });

  it('useSaveProductMutation calls saveProduct and invalidates queries', async () => {
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
      expect.objectContaining({ queryKey: ['product', mockSavedId] }),
    );
    expect(invalidateSpy).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ['products'] }));
  });

  it('useSaveProductMutation invalidates parent and new-product cache when needed', async () => {
    mockedSaveProduct.mockResolvedValue(789);
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useSaveProductMutation(), { wrapper });

    result.current.mutate({
      product: { ...newProductDraft, name: 'Child', parentID: 321 },
      originalImages: [],
      originalVideos: [],
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ['product', 321] }),
    );
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ['product', 'new'] }),
    );
  });

  it('useDeleteProductMutation removes old products and keeps new drafts cached', async () => {
    mockedDeleteProduct.mockResolvedValue(undefined);
    const removeSpy = jest.spyOn(queryClient, 'removeQueries');
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useDeleteProductMutation(), { wrapper });

    result.current.mutate({ ...existingProduct, id: 123, name: 'Old' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(removeSpy).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ['product', 123] }));
    expect(invalidateSpy).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ['products'] }));

    jest.clearAllMocks();
    const { result: newResult } = renderHook(() => useDeleteProductMutation(), { wrapper });
    newResult.current.mutate(newProductDraft);

    await waitFor(() => expect(newResult.current.isSuccess).toBe(true));

    expect(removeSpy).not.toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ['product', 'new'] }),
    );
  });
});
