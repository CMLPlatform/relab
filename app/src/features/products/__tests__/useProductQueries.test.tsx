import { afterEach, describe, expect, it, jest } from '@jest/globals';
import {
  onlineManager,
  QueryClient,
  QueryClientProvider,
  useInfiniteQuery,
} from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type React from 'react';
import {
  productsInfiniteQueryOptions,
  useBaseProductQuery,
  useComponentQuery,
  useDeleteProductMutation,
  useSaveProductMutation,
  useSearchBrandsQuery,
  useSearchProductTypesQuery,
} from '@/features/products/queries';
import { ApiError } from '@/services/api/errors';
import { searchProductBrands } from '@/services/api/productSuggestions';
import {
  getBaseProduct,
  getComponent,
  ProductNotFoundError,
  products,
} from '@/services/api/products';
import { searchProductTypes } from '@/services/api/productTypes';
import { deleteProduct, MediaSyncError, saveProduct } from '@/services/api/saving';
import { baseProduct } from '@/test-utils/fixtures';
import type { Product } from '@/types/Product';

jest.mock('@/services/api/productSuggestions', () => ({
  searchProductBrands: jest.fn(),
}));

type ProductsModule = typeof import('@/services/api/products');

jest.mock('@/services/api/products', () => {
  const actual = jest.requireActual('@/services/api/products') as ProductsModule;
  return {
    ...actual,
    getBaseProduct: jest.fn(),
    getComponent: jest.fn(),
    products: jest.fn(),
  };
});

jest.mock('@/services/api/productTypes', () => ({
  searchProductTypes: jest.fn(),
}));

jest.mock('@/services/api/saving', () => ({
  ...jest.requireActual<typeof import('@/services/api/saving')>('@/services/api/saving'),
  saveProduct: jest.fn(),
  deleteProduct: jest.fn(),
}));

const queryClient = new QueryClient({
  // useSaveProductMutation sets its own retry predicate (retries network-level
  // failures only, up to the same count `retry: 3` would give) so it survives
  // transient blips offline-and-reconnect (Task 14); an explicit per-mutation
  // retry option always beats this client's retry: false default, so zero the
  // delay too or these failure-path tests wait out real backoff.
  defaultOptions: {
    queries: { retry: false },
    mutations: { retry: false, retryDelay: 0 },
  },
});

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
);

describe('useProductQueries', () => {
  afterEach(() => {
    act(() => onlineManager.setOnline(true));
  });

  const mockedProducts = jest.mocked(products);
  const mockedSearchBrands = jest.mocked(searchProductBrands);
  const mockedSearchProductTypes = jest.mocked(searchProductTypes);
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

  describe('productsInfiniteQueryOptions', () => {
    it('calls products without owner scope by default, starting at page 1', async () => {
      const mockData = { items: [], total: 0, page: 1, pages: 1, size: 24 };
      mockedProducts.mockResolvedValue(mockData);

      const { result } = renderHook(
        () => useInfiniteQuery(productsInfiniteQueryOptions('all', '')),
        { wrapper },
      );

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(products).toHaveBeenCalledWith(expect.objectContaining({ page: 1, size: 24 }));
      expect(mockedProducts.mock.calls[0][0]).not.toHaveProperty('owner');
    });

    it('scopes to owner: "me" for the "mine" filter', async () => {
      const mockData = { items: [], total: 0, page: 1, pages: 1, size: 24 };
      mockedProducts.mockResolvedValue(mockData);

      const { result } = renderHook(
        () => useInfiniteQuery(productsInfiniteQueryOptions('mine', '')),
        { wrapper },
      );

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(products).toHaveBeenCalledWith(expect.objectContaining({ owner: 'me' }));
    });

    it('forwards extra filters and search params', async () => {
      const mockData = { items: [], total: 0, page: 1, pages: 1, size: 24 };
      const createdAfter = new Date('2026-01-02T03:04:05.000Z');
      mockedProducts.mockResolvedValue(mockData);

      renderHook(
        () =>
          useInfiniteQuery(
            productsInfiniteQueryOptions('all', 'lamp', ['+name'], {
              brands: ['ikea', 'philips'],
              createdAfter,
              productTypeNames: ['Furniture'],
            }),
          ),
        { wrapper },
      );

      await waitFor(() => expect(products).toHaveBeenCalled());
      expect(products).toHaveBeenCalledWith(
        expect.objectContaining({
          page: 1,
          size: 24,
          search: 'lamp',
          orderBy: ['+name'],
          brands: ['ikea', 'philips'],
          createdAfter,
          productTypeNames: ['Furniture'],
        }),
      );
    });

    it('fetches page 1 first and flags a next page when more results remain', async () => {
      mockedProducts.mockResolvedValue({
        items: [{ ...baseProduct, id: 1, name: 'Product A' }],
        total: 30,
        page: 1,
        pages: 2,
        size: 24,
      });

      const { result } = renderHook(
        () => useInfiniteQuery(productsInfiniteQueryOptions('all', '')),
        {
          wrapper,
        },
      );

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(products).toHaveBeenCalledWith(expect.objectContaining({ page: 1, size: 24 }));
      expect(result.current.hasNextPage).toBe(true);
    });

    it('flags no next page once the loaded pages cover the total', async () => {
      mockedProducts.mockResolvedValue({
        items: [{ ...baseProduct, id: 1, name: 'Product A' }],
        total: 1,
        page: 1,
        pages: 1,
        size: 24,
      });

      const { result } = renderHook(
        () => useInfiniteQuery(productsInfiniteQueryOptions('all', '')),
        {
          wrapper,
        },
      );

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.hasNextPage).toBe(false);
    });

    // Regression: infinite scroll must APPEND the next page's items below the
    // ones already on screen, never replace them — this is the load-bearing
    // behaviour the products catalogue's onEndReached/"Load more" wiring relies on.
    it('appends the next page below the first instead of replacing it', async () => {
      // total (30) must exceed the hardcoded page size (24) or getNextPageParam
      // never reports a next page and fetchNextPage below would no-op.
      mockedProducts
        .mockResolvedValueOnce({
          items: [
            { ...baseProduct, id: 1, name: 'Product A' },
            { ...baseProduct, id: 2, name: 'Product B' },
          ],
          total: 30,
          page: 1,
          pages: 2,
          size: 24,
        })
        .mockResolvedValueOnce({
          items: [
            { ...baseProduct, id: 3, name: 'Product C' },
            { ...baseProduct, id: 4, name: 'Product D' },
          ],
          total: 30,
          page: 2,
          pages: 2,
          size: 24,
        });

      const { result } = renderHook(
        () => useInfiniteQuery(productsInfiniteQueryOptions('all', '')),
        {
          wrapper,
        },
      );

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(
        result.current.data?.pages.flatMap((page) => page.items.map((item) => item.name)),
      ).toEqual(['Product A', 'Product B']);

      result.current.fetchNextPage();

      await waitFor(() => expect(result.current.data?.pages).toHaveLength(2));
      expect(
        result.current.data?.pages.flatMap((page) => page.items.map((item) => item.name)),
      ).toEqual(['Product A', 'Product B', 'Product C', 'Product D']);
      expect(products).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2, size: 24 }));
    });
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

  it('useSaveProductMutation does not touch the cache when saving fails', async () => {
    // Every mutation here was happy-path only. A save that fails must leave the
    // cache alone, or the UI reports a change the server never accepted.
    mockedSaveProduct.mockRejectedValue(new Error('save failed'));
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');
    invalidateSpy.mockClear();

    const { result } = renderHook(() => useSaveProductMutation(), { wrapper });

    result.current.mutate({
      product: { ...newProductDraft, name: 'New' },
      originalImages: [],
      originalVideos: [],
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(invalidateSpy).not.toHaveBeenCalled();
  });

  it('useSaveProductMutation refreshes the cache when only the media sync failed', async () => {
    // The entity write landed, so leaving the cache alone would keep showing
    // pre-save data the server no longer has.
    mockedSaveProduct.mockRejectedValue(new MediaSyncError(7, new Error('413')));
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');
    invalidateSpy.mockClear();

    const { result } = renderHook(() => useSaveProductMutation(), { wrapper });

    result.current.mutate({
      product: { ...newProductDraft, name: 'New' },
      originalImages: [],
      originalVideos: [],
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['baseProduct', 7] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['products'] });
  });

  it('useSaveProductMutation does not retry a real server response, to avoid re-POSTing a create the server already accepted or rejected', async () => {
    mockedSaveProduct.mockRejectedValue(new ApiError('Validation failed', 422));

    const { result } = renderHook(() => useSaveProductMutation(), { wrapper });

    result.current.mutate({
      product: { ...newProductDraft, name: 'New' },
      originalImages: [],
      originalVideos: [],
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(mockedSaveProduct).toHaveBeenCalledTimes(1);
  });

  it('useSaveProductMutation retries a network-level failure that never reached the server', async () => {
    mockedSaveProduct.mockRejectedValue(new TypeError('Network request failed'));

    const { result } = renderHook(() => useSaveProductMutation(), { wrapper });

    result.current.mutate({
      product: { ...newProductDraft, name: 'New' },
      originalImages: [],
      originalVideos: [],
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    // 1 initial attempt + 3 retries — same total as the plain `retry: 3` option.
    expect(mockedSaveProduct).toHaveBeenCalledTimes(4);
  });

  // 409 is the idempotency store's in-flight marker: an earlier attempt under
  // this key is still committing. Giving up there strands the user on a Save
  // that has to be pressed again — and a second press with the same key is
  // exactly what the retry does for free.
  it('retries a 409 in-flight conflict and succeeds on the replayed response', async () => {
    mockedSaveProduct
      .mockRejectedValueOnce(new ApiError('Request already in progress', 409))
      .mockResolvedValueOnce(321);

    const { result } = renderHook(() => useSaveProductMutation(), { wrapper });

    result.current.mutate({
      product: { ...newProductDraft, name: 'New' },
      originalImages: [],
      originalVideos: [],
      idempotencyKey: 'fixed-key-409',
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedSaveProduct).toHaveBeenCalledTimes(2);
  });

  it('retries a network-fail-then-succeed save with the same idempotencyKey on every attempt', async () => {
    // The key must come from the mutation variables, not be minted fresh
    // inside the mutationFn on each retry — otherwise a retried create would
    // carry a different key per attempt and the server would see them as
    // unrelated requests instead of a replay.
    mockedSaveProduct
      .mockRejectedValueOnce(new TypeError('Network request failed'))
      .mockResolvedValueOnce(321);

    const { result } = renderHook(() => useSaveProductMutation(), { wrapper });

    result.current.mutate({
      product: { ...newProductDraft, name: 'New' },
      originalImages: [],
      originalVideos: [],
      idempotencyKey: 'fixed-key-123',
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockedSaveProduct).toHaveBeenCalledTimes(2);
    const keysUsed = mockedSaveProduct.mock.calls.map((call) => call[3]);
    expect(keysUsed).toEqual(['fixed-key-123', 'fixed-key-123']);
  });

  it('pauses offline instead of failing or firing, then sends the POST on reconnect', async () => {
    act(() => onlineManager.setOnline(false));
    mockedSaveProduct.mockResolvedValue(999);

    const { result } = renderHook(() => useSaveProductMutation(), { wrapper });

    result.current.mutate({
      product: { ...newProductDraft, name: 'Offline capture' },
      originalImages: [],
      originalVideos: [],
    });

    await waitFor(() => expect(result.current.isPaused).toBe(true));
    expect(result.current.isSuccess).toBe(false);
    expect(mockedSaveProduct).not.toHaveBeenCalled();

    act(() => onlineManager.setOnline(true));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedSaveProduct).toHaveBeenCalledTimes(1);
  });

  it('useDeleteProductMutation does not evict the cache when deletion fails', async () => {
    // A failed delete must not remove the entity locally: the record still
    // exists on the server, and evicting it hides that from the user.
    mockedDeleteProduct.mockRejectedValue(new Error('delete failed'));
    const removeSpy = jest.spyOn(queryClient, 'removeQueries');
    removeSpy.mockClear();

    const { result } = renderHook(() => useDeleteProductMutation(), { wrapper });

    result.current.mutate(existingProduct);

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(removeSpy).not.toHaveBeenCalled();
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
