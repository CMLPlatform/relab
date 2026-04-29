import { describe, expect, it, jest } from '@jest/globals';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type React from 'react';
import { useAuth } from '@/context/auth';
import type { Product } from '@/types/Product';
import { useProductForm } from '../useProductForm';
import {
  useBaseProductQuery,
  useDeleteProductMutation,
  useSaveProductMutation,
} from '../useProductQueries';

jest.mock('@/context/auth', () => ({
  useAuth: jest.fn(() => ({ user: { id: '1', username: 'test' }, refetch: jest.fn() })),
}));

jest.mock('@/components/common/dialogContext', () => {
  const actual = jest.requireActual<typeof import('@/components/common/dialogContext')>(
    '@/components/common/dialogContext',
  );
  return {
    ...actual,
    useDialog: jest.fn(() => ({
      alert: jest.fn(),
      input: jest.fn(),
      toast: jest.fn(),
    })),
  };
});

jest.mock('../useProductQueries', () => ({
  useBaseProductQuery: jest.fn(() => ({ data: undefined, isLoading: false })),
  useComponentQuery: jest.fn(() => ({ data: undefined, isLoading: false })),
  useSaveProductMutation: jest.fn(),
  useDeleteProductMutation: jest.fn(),
}));

jest.mock('@/services/api/products', () => ({
  newProduct: jest.fn((seed: { name?: string; parentID?: number } = {}) => ({
    role: typeof seed.parentID === 'number' ? 'component' : 'product',
    name: seed.name ?? '',
    parentID: seed.parentID,
    componentIDs: [],
    components: [],
    images: [],
    videos: [],
  })),
}));

const mockPush = jest.fn();
const mockReplace = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: jest.fn(() => ({
    push: mockPush,
    replace: mockReplace,
  })),
}));

const mockProduct = {
  id: 123,
  role: 'product',
  name: 'Recycled Aluminum Laptop Stand',
  brand: 'CircularTech',
  componentIDs: [],
  components: [],
  physicalProperties: { weight: 0, width: 0, height: 0, depth: 0 },
  circularityProperties: {
    recyclabilityObservation: '',
    remanufacturabilityObservation: '',
    repairabilityObservation: '',
  },
  images: [],
  videos: [],
  ownedBy: 'me',
} satisfies Product;

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
});

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
);

describe('useProductForm', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('initializes with existing product data', async () => {
    (useBaseProductQuery as jest.Mock).mockReturnValue({ data: mockProduct, isLoading: false });
    (useSaveProductMutation as jest.Mock).mockReturnValue({ mutate: jest.fn() });
    (useDeleteProductMutation as jest.Mock).mockReturnValue({ mutate: jest.fn() });

    const { result } = renderHook(() => useProductForm('123', { role: 'product' }), { wrapper });

    await waitFor(() => {
      expect(result.current.product.id).toBe(123);
      expect(result.current.product.name).toBe('Recycled Aluminum Laptop Stand');
      expect(result.current.editMode).toBe(false);
    });
  });

  it('initializes for a new product if id is "new"', async () => {
    (useBaseProductQuery as jest.Mock).mockReturnValue({ data: undefined, isLoading: false });
    (useSaveProductMutation as jest.Mock).mockReturnValue({ mutate: jest.fn() });
    (useDeleteProductMutation as jest.Mock).mockReturnValue({ mutate: jest.fn() });

    const { result } = renderHook(
      () =>
        useProductForm(undefined, {
          role: 'product',
          isNew: true,
          draftSeed: { name: 'New Intent' },
        }),
      { wrapper },
    );

    expect(result.current.product.images).toEqual([]);

    await waitFor(() => {
      expect(result.current.isNew).toBe(true);
      expect(result.current.editMode).toBe(true);
      expect(result.current.product.name).toBe('New Intent');
    });
  });

  it('forces new-draft mode when options.isNew is set regardless of the id arg', async () => {
    (useBaseProductQuery as jest.Mock).mockReturnValue({ data: undefined, isLoading: false });
    (useSaveProductMutation as jest.Mock).mockReturnValue({ mutate: jest.fn() });
    (useDeleteProductMutation as jest.Mock).mockReturnValue({ mutate: jest.fn() });

    const { result } = renderHook(
      () =>
        useProductForm(undefined, {
          role: 'product',
          isNew: true,
          draftSeed: { name: 'Seeded' },
        }),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.isNew).toBe(true);
      expect(result.current.editMode).toBe(true);
      expect(result.current.product.name).toBe('Seeded');
    });
  });

  it('redirects guests away from the new-product flow', async () => {
    const mockedUseAuth = jest.mocked(useAuth);
    mockedUseAuth.mockReturnValue({
      user: undefined,
      isLoading: false,
      refetch: jest.fn(async () => {}),
    });
    (useBaseProductQuery as jest.Mock).mockReturnValue({ data: undefined, isLoading: false });
    (useSaveProductMutation as jest.Mock).mockReturnValue({ mutate: jest.fn() });
    (useDeleteProductMutation as jest.Mock).mockReturnValue({ mutate: jest.fn() });

    renderHook(() => useProductForm(undefined, { role: 'product', isNew: true }), { wrapper });

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith({
        pathname: '/login',
        params: { redirectTo: '/products' },
      });
    });
  });

  it('handles field changes', async () => {
    (useBaseProductQuery as jest.Mock).mockReturnValue({ data: mockProduct, isLoading: false });
    (useSaveProductMutation as jest.Mock).mockReturnValue({ mutate: jest.fn() });
    (useDeleteProductMutation as jest.Mock).mockReturnValue({ mutate: jest.fn() });

    const { result } = renderHook(() => useProductForm('123', { role: 'product' }), { wrapper });

    await waitFor(() => {
      expect(result.current.product.name).toBe('Recycled Aluminum Laptop Stand');
    });

    await act(async () => {
      result.current.onProductNameChange('Updated Name');
    });

    expect(result.current.product.name).toBe('Updated Name');
  });

  it('triggers save mutation when saveAndExit is called with a dirty form', async () => {
    const mockMutate = jest.fn();
    (useBaseProductQuery as jest.Mock).mockReturnValue({ data: mockProduct, isLoading: false });
    (useSaveProductMutation as jest.Mock).mockReturnValue({ mutate: mockMutate });
    (useDeleteProductMutation as jest.Mock).mockReturnValue({ mutate: jest.fn() });

    const { result } = renderHook(
      () => useProductForm('123', { role: 'product', initialEditMode: true }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.product.id).toBe(123));
    expect(result.current.editMode).toBe(true);

    await act(async () => {
      result.current.onProductNameChange('Edited Name');
    });

    await act(async () => {
      result.current.saveAndExit();
    });

    expect(mockMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        product: expect.objectContaining({ name: 'Edited Name' }),
      }),
      expect.any(Object),
    );
  });

  it('calls onSaveSuccess with the current id when saveAndExit is called on a clean existing entity', async () => {
    const onSaveSuccess = jest.fn();
    (useBaseProductQuery as jest.Mock).mockReturnValue({ data: mockProduct, isLoading: false });
    (useSaveProductMutation as jest.Mock).mockReturnValue({ mutate: jest.fn() });
    (useDeleteProductMutation as jest.Mock).mockReturnValue({ mutate: jest.fn() });

    const { result } = renderHook(
      () => useProductForm('123', { role: 'product', initialEditMode: true, onSaveSuccess }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.product.id).toBe(123));

    await act(async () => {
      result.current.saveAndExit();
    });

    expect(onSaveSuccess).toHaveBeenCalledWith(123);
  });

  it('discards to /products when saveAndExit is called on a clean new draft', async () => {
    const mockMutate = jest.fn();
    (useBaseProductQuery as jest.Mock).mockReturnValue({ data: undefined, isLoading: false });
    (useSaveProductMutation as jest.Mock).mockReturnValue({ mutate: mockMutate });
    (useDeleteProductMutation as jest.Mock).mockReturnValue({ mutate: jest.fn() });

    const { result } = renderHook(
      () =>
        useProductForm(undefined, { role: 'product', isNew: true, draftSeed: { name: 'Draft' } }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.isNew).toBe(true));

    await act(async () => {
      result.current.saveAndExit();
    });

    expect(mockReplace).toHaveBeenCalledWith('/products');
    expect(mockMutate).not.toHaveBeenCalled();
  });

  it('shows a dialog when saving fails', async () => {
    const mockMutate = jest.fn(
      (
        _payload: unknown,
        options: { onSuccess?: (id: number) => void; onError?: (err: Error) => void },
      ) => options.onError?.(new Error('Network failure')),
    );
    (useBaseProductQuery as jest.Mock).mockReturnValue({ data: mockProduct, isLoading: false });
    (useSaveProductMutation as jest.Mock).mockReturnValue({ mutate: mockMutate });
    (useDeleteProductMutation as jest.Mock).mockReturnValue({ mutate: jest.fn() });

    const { result } = renderHook(
      () => useProductForm('123', { role: 'product', initialEditMode: true }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.product.id).toBe(123));

    await act(async () => {
      result.current.onProductNameChange('Edited Name');
    });

    await act(async () => {
      result.current.saveAndExit();
    });

    expect(mockMutate).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ onError: expect.any(Function) }),
    );
  });

  it('calls delete mutation and navigates to /products on success', async () => {
    const mockDeleteMutate = jest.fn((_payload: unknown, options: { onSuccess?: () => void }) =>
      options.onSuccess?.(),
    );
    (useBaseProductQuery as jest.Mock).mockReturnValue({ data: mockProduct, isLoading: false });
    (useSaveProductMutation as jest.Mock).mockReturnValue({ mutate: jest.fn() });
    (useDeleteProductMutation as jest.Mock).mockReturnValue({ mutate: mockDeleteMutate });

    const { result } = renderHook(() => useProductForm('123', { role: 'product' }), { wrapper });
    await waitFor(() => expect(result.current.product.id).toBe(123));

    await act(async () => {
      result.current.onProductDelete();
    });

    expect(mockDeleteMutate).toHaveBeenCalledWith(
      expect.objectContaining({ id: 123 }),
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
    expect(mockReplace).toHaveBeenCalledWith('/products');
  });

  it('calls onSaveSuccess with the savedId after saving a new draft', async () => {
    const mockMutate = jest.fn(
      (_payload: unknown, options: { onSuccess?: (savedId: number) => void }) =>
        options.onSuccess?.(987),
    );
    const onSaveSuccess = jest.fn();
    (useBaseProductQuery as jest.Mock).mockReturnValue({ data: undefined, isLoading: false });
    (useSaveProductMutation as jest.Mock).mockReturnValue({ mutate: mockMutate });
    (useDeleteProductMutation as jest.Mock).mockReturnValue({ mutate: jest.fn() });

    const { result } = renderHook(
      () =>
        useProductForm(undefined, {
          role: 'component',
          isNew: true,
          draftSeed: { name: 'Draft', parentID: 42 },
          onSaveSuccess,
        }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.isNew).toBe(true));

    await act(async () => {
      result.current.onProductNameChange('Filled Draft');
    });

    await act(async () => {
      result.current.saveAndExit();
    });

    expect(mockMutate).toHaveBeenCalled();
    expect(onSaveSuccess).toHaveBeenCalledWith(987);
  });
});
