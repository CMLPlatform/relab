import { describe, expect, it, jest } from '@jest/globals';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import React from 'react';
import {
  useDeleteProductMutation,
  useProductQuery,
  useProductTypesQuery,
  useProductsQuery,
  useSearchBrandsQuery,
  useSearchProductTypesQuery,
  useSaveProductMutation,
} from '../useProductQueries';
import * as saving from '@/services/api/saving';
import * as fetching from '@/services/api/fetching';

jest.mock('@/services/api/fetching', () => ({
  allProducts: jest.fn(),
  getProduct: jest.fn(),
  myProducts: jest.fn(),
  allBrands: jest.fn(),
  searchBrands: jest.fn(),
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
  beforeEach(() => {
    jest.clearAllMocks();
    queryClient.clear();
  });

  it('useProductsQuery calls allProducts by default', async () => {
    const mockData = { items: [], total: 0, page: 1, pages: 1 };
    (fetching.allProducts as jest.MockedFunction<any>).mockResolvedValue(mockData);

    const { result } = renderHook(() => useProductsQuery('all', 1, ''), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetching.allProducts).toHaveBeenCalled();
    expect(result.current.data).toEqual(mockData);
  });

  it('useProductsQuery calls myProducts for "mine" filter', async () => {
    const mockData = { items: [], total: 0, page: 1, pages: 1 };
    (fetching.myProducts as jest.MockedFunction<any>).mockResolvedValue(mockData);

    const { result } = renderHook(() => useProductsQuery('mine', 1, ''), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetching.myProducts).toHaveBeenCalled();
  });

  it('useProductsQuery forwards extra filters and search params', async () => {
    const mockData = { items: [], total: 0, page: 2, pages: 3 };
    const createdAfter = new Date('2026-01-02T03:04:05.000Z');
    (fetching.allProducts as jest.MockedFunction<any>).mockResolvedValue(mockData);

    renderHook(
      () =>
        useProductsQuery('all', 2, 'lamp', ['name'], {
          brands: ['ikea', 'philips'],
          createdAfter,
          productTypeNames: ['Furniture'],
        }),
      { wrapper },
    );

    await waitFor(() => expect(fetching.allProducts).toHaveBeenCalled());
    expect(fetching.allProducts).toHaveBeenCalledWith(
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
    (fetching.searchBrands as jest.MockedFunction<any>).mockResolvedValue([]);
    (fetching.searchProductTypes as jest.MockedFunction<any>).mockResolvedValue([]);

    renderHook(() => useSearchBrandsQuery(''), { wrapper });
    renderHook(() => useSearchProductTypesQuery(''), { wrapper });

    await waitFor(() => expect(fetching.searchBrands).toHaveBeenCalled());
    expect(fetching.searchBrands).toHaveBeenCalledWith(undefined, 1, 50);
    expect(fetching.searchProductTypes).toHaveBeenCalledWith(undefined, 1, 50);
  });

  it('useProductTypesQuery calls allProductTypes', async () => {
    (fetching.allProductTypes as jest.MockedFunction<any>).mockResolvedValue([]);

    const { result } = renderHook(() => useProductTypesQuery(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetching.allProductTypes).toHaveBeenCalled();
  });

  it('useProductQuery calls getProduct and respects enabled state', async () => {
    (fetching.getProduct as jest.MockedFunction<any>).mockResolvedValue({ id: 123, name: 'Test' });

    const { result, rerender } = renderHook<ReturnType<typeof useProductQuery>, { id: any }>(
      ({ id }: { id: any }) => useProductQuery(id),
      {
        wrapper,
        initialProps: { id: 'new' as any },
      },
    );

    // Should not run for 'new'
    expect(result.current.isLoading).toBe(false);
    expect(fetching.getProduct).not.toHaveBeenCalled();

    rerender({ id: 123 });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetching.getProduct).toHaveBeenCalledWith(123);
  });

  it('useSaveProductMutation calls saveProduct and invalidates queries', async () => {
    const mockSavedId = 456;
    (saving.saveProduct as jest.MockedFunction<any>).mockResolvedValue(mockSavedId);
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useSaveProductMutation(), { wrapper });

    result.current.mutate({
      product: { id: 'new', name: 'New' } as any,
      originalImages: [],
      originalVideos: [],
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(saving.saveProduct).toHaveBeenCalled();
    expect(invalidateSpy).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ['product', mockSavedId] }));
    expect(invalidateSpy).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ['products'] }));
  });

  it('useSaveProductMutation invalidates parent and new-product cache when needed', async () => {
    (saving.saveProduct as jest.MockedFunction<any>).mockResolvedValue(789);
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useSaveProductMutation(), { wrapper });

    result.current.mutate({
      product: { id: 'new', name: 'Child', parentID: 321 } as any,
      originalImages: [],
      originalVideos: [],
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(invalidateSpy).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ['product', 321] }));
    expect(invalidateSpy).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ['product', 'new'] }));
  });

  it('useDeleteProductMutation removes old products and keeps new drafts cached', async () => {
    (saving.deleteProduct as jest.MockedFunction<any>).mockResolvedValue(undefined);
    const removeSpy = jest.spyOn(queryClient, 'removeQueries');
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useDeleteProductMutation(), { wrapper });

    result.current.mutate({ id: 123, name: 'Old' } as any);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(removeSpy).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ['product', 123] }));
    expect(invalidateSpy).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ['products'] }));

    jest.clearAllMocks();
    const { result: newResult } = renderHook(() => useDeleteProductMutation(), { wrapper });
    newResult.current.mutate({ id: 'new', name: 'Draft' } as any);

    await waitFor(() => expect(newResult.current.isSuccess).toBe(true));

    expect(removeSpy).not.toHaveBeenCalledWith(expect.objectContaining({ queryKey: ['product', 'new'] }));
  });
});
