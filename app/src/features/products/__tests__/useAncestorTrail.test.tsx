import { describe, expect, it, jest } from '@jest/globals';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import type React from 'react';
import { useAncestorTrail } from '@/features/products/useAncestorTrail';
import { getBaseProduct, getComponent, ProductNotFoundError } from '@/services/api/products';
import type { Product } from '@/types/Product';

type ProductsModule = typeof import('@/services/api/products');

jest.mock('@/services/api/products', () => {
  const actual = jest.requireActual('@/services/api/products') as ProductsModule;
  return {
    ...actual,
    getBaseProduct: jest.fn(),
    getComponent: jest.fn(),
  };
});

const mockGetComponent = getComponent as jest.MockedFunction<typeof getComponent>;
const mockGetBaseProduct = getBaseProduct as jest.MockedFunction<typeof getBaseProduct>;

function node(id: number, role: 'product' | 'component', parentID?: number): Product {
  return { id, name: `node-${id}`, role, parentID } as Product;
}

function wrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

function renderTrail(parentID: number | undefined) {
  return renderHook(() => useAncestorTrail(parentID), { wrapper });
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('useAncestorTrail', () => {
  it('is idle with an empty trail when there is no parent', () => {
    const { result } = renderTrail(undefined);

    expect(result.current.ancestors).toEqual([]);
    expect(result.current.isLoading).toBe(false);
    expect(mockGetComponent).not.toHaveBeenCalled();
  });

  it('walks up from the parent and returns the trail root-first', async () => {
    // component 3 → component 2 → base product 1
    mockGetComponent.mockImplementation(async (id: number) => {
      if (id === 3) return node(3, 'component', 2);
      if (id === 2) return node(2, 'component', 1);
      throw new ProductNotFoundError(id);
    });
    mockGetBaseProduct.mockResolvedValue(node(1, 'product'));

    const { result } = renderTrail(3);

    await waitFor(() => expect(result.current.ancestors).toHaveLength(3));
    expect(result.current.ancestors).toEqual([
      { id: 1, name: 'node-1', role: 'product' },
      { id: 2, name: 'node-2', role: 'component' },
      { id: 3, name: 'node-3', role: 'component' },
    ]);
  });

  it('falls back to the base-product endpoint when the component lookup 404s', async () => {
    mockGetComponent.mockRejectedValue(new ProductNotFoundError(9));
    mockGetBaseProduct.mockResolvedValue(node(9, 'product'));

    const { result } = renderTrail(9);

    await waitFor(() => expect(result.current.ancestors).toHaveLength(1));
    expect(result.current.ancestors[0]).toEqual({ id: 9, name: 'node-9', role: 'product' });
    expect(mockGetBaseProduct).toHaveBeenCalledWith(9);
  });

  it('stops instead of looping forever when the chain contains a cycle', async () => {
    // 1 → 2 → 1: the second visit to 1 must end the walk.
    mockGetComponent.mockImplementation(async (id: number) =>
      node(id, 'component', id === 1 ? 2 : 1),
    );

    const { result } = renderTrail(1);

    await waitFor(() => expect(result.current.ancestors).toHaveLength(2));
    expect(result.current.ancestors.map((crumb) => crumb.id)).toEqual([2, 1]);
  });

  it('caps an unbounded chain at the maximum depth', async () => {
    // Every node parents the next id, so the chain never terminates on its own.
    mockGetComponent.mockImplementation(async (id: number) => node(id, 'component', id + 1));

    const { result } = renderTrail(1);

    await waitFor(() => expect(result.current.ancestors).toHaveLength(12));
  });

  it('surfaces an empty trail when a lookup fails for a non-404 reason', async () => {
    mockGetComponent.mockRejectedValue(new Error('network down'));

    const { result } = renderTrail(4);

    // A non-404 is retried once by the shared query policy before it settles.
    await waitFor(() => expect(result.current.isLoading).toBe(false), { timeout: 5000 });
    expect(result.current.ancestors).toEqual([]);
    expect(mockGetBaseProduct).not.toHaveBeenCalled();
  });
});
