import { describe, expect, it, jest } from '@jest/globals';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type React from 'react';
import { DialogProvider } from '@/components/common/DialogProvider';
import { AuthProvider, useAuth } from '@/context/AuthProvider';
import { consumeNewProductIntent } from '@/services/newProductStore';
import type { Product } from '@/types/Product';
import { useProductForm } from '../useProductForm';
import {
  useDeleteProductMutation,
  useProductQuery,
  useSaveProductMutation,
} from '../useProductQueries';

jest.mock('@/context/AuthProvider', () => ({
  useAuth: jest.fn(() => ({ user: { id: '1', username: 'test' }, refetch: jest.fn() })),
  AuthProvider: jest.fn(({ children }: { children: React.ReactNode }) => <>{children}</>),
}));

jest.mock('../useProductQueries', () => ({
  useProductQuery: jest.fn(),
  useSaveProductMutation: jest.fn(),
  useDeleteProductMutation: jest.fn(),
}));

jest.mock('@/services/newProductStore', () => ({
  consumeNewProductIntent: jest.fn(),
}));

jest.mock('@/services/api/products', () => ({
  newProduct: jest.fn((name) => ({ name, parentID: NaN, images: [], videos: [] })),
}));

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockSetParams = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: jest.fn(() => ({
    push: mockPush,
    replace: mockReplace,
    setParams: mockSetParams,
  })),
}));

const mockProduct = {
  id: 123,
  name: 'Test Product',
  brand: 'Test Brand',
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
} satisfies Product;

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
});

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <DialogProvider>{children}</DialogProvider>
    </AuthProvider>
  </QueryClientProvider>
);

describe('useProductForm', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('initializes with existing product data', async () => {
    (useProductQuery as jest.Mock).mockReturnValue({
      data: mockProduct,
      isLoading: false,
    });
    (useSaveProductMutation as jest.Mock).mockReturnValue({ mutate: jest.fn() });
    (useDeleteProductMutation as jest.Mock).mockReturnValue({ mutate: jest.fn() });

    const { result } = renderHook(() => useProductForm('123'), { wrapper });

    await waitFor(() => {
      expect(result.current.product.id).toBe(123);
      expect(result.current.product.name).toBe('Test Product');
      expect(result.current.editMode).toBe(false);
    });
  });

  it('initializes for a new product if id is "new"', async () => {
    (useProductQuery as jest.Mock).mockReturnValue({ data: undefined, isLoading: false });
    (useSaveProductMutation as jest.Mock).mockReturnValue({ mutate: jest.fn() });
    (useDeleteProductMutation as jest.Mock).mockReturnValue({ mutate: jest.fn() });
    (consumeNewProductIntent as jest.Mock).mockReturnValue({ name: 'New Intent' });

    const { result } = renderHook(() => useProductForm('new'), { wrapper });

    expect(result.current.product.images).toEqual([]);

    await waitFor(() => {
      expect(result.current.isNew).toBe(true);
      expect(result.current.editMode).toBe(true);
      expect(result.current.product.name).toBe('New Intent');
    });
  });

  it('redirects guests away from the new-product flow', async () => {
    const mockedUseAuth = jest.mocked(useAuth);
    mockedUseAuth.mockReturnValue({
      user: undefined,
      isLoading: false,
      refetch: jest.fn(async () => {}),
    });
    (useProductQuery as jest.Mock).mockReturnValue({ data: undefined, isLoading: false });
    (useSaveProductMutation as jest.Mock).mockReturnValue({ mutate: jest.fn() });
    (useDeleteProductMutation as jest.Mock).mockReturnValue({ mutate: jest.fn() });

    renderHook(() => useProductForm('new'), { wrapper });

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith({
        pathname: '/login',
        params: { redirectTo: '/products' },
      });
    });
  });

  it('handles field changes', async () => {
    (useProductQuery as jest.Mock).mockReturnValue({ data: mockProduct, isLoading: false });
    (useSaveProductMutation as jest.Mock).mockReturnValue({ mutate: jest.fn() });
    (useDeleteProductMutation as jest.Mock).mockReturnValue({ mutate: jest.fn() });

    const { result } = renderHook(() => useProductForm('123'), { wrapper });

    await waitFor(() => {
      expect(result.current.product.name).toBe('Test Product');
    });

    await act(async () => {
      result.current.onProductNameChange('Updated Name');
    });

    expect(result.current.product.name).toBe('Updated Name');
  });

  it('triggers save mutation when toggleEditMode is called while editing', async () => {
    const mockMutate = jest.fn();
    (useProductQuery as jest.Mock).mockReturnValue({ data: mockProduct, isLoading: false });
    (useSaveProductMutation as jest.Mock).mockReturnValue({ mutate: mockMutate });
    (useDeleteProductMutation as jest.Mock).mockReturnValue({ mutate: jest.fn() });

    const { result } = renderHook(() => useProductForm('123'), { wrapper });

    // Wait for initialization
    await waitFor(() => expect(result.current.product.id).toBe(123));

    // Enable edit mode first
    await act(async () => {
      result.current.toggleEditMode();
    });
    expect(result.current.editMode).toBe(true);

    // Call it again to save
    await act(async () => {
      result.current.toggleEditMode();
    });

    expect(mockMutate).toHaveBeenCalledWith(
      expect.objectContaining({ product: expect.objectContaining({ name: 'Test Product' }) }),
      expect.any(Object),
    );
  });

  it('shows a dialog when saving fails', async () => {
    const mockMutate = jest.fn(
      (
        _payload: unknown,
        options: { onSuccess?: (id: number) => void; onError?: (err: Error) => void },
      ) => options.onError?.(new Error('Network failure')),
    );
    (useProductQuery as jest.Mock).mockReturnValue({ data: mockProduct, isLoading: false });
    (useSaveProductMutation as jest.Mock).mockReturnValue({ mutate: mockMutate });
    (useDeleteProductMutation as jest.Mock).mockReturnValue({ mutate: jest.fn() });

    const { result } = renderHook(() => useProductForm('123'), { wrapper });
    await waitFor(() => expect(result.current.product.id).toBe(123));

    // Enter edit mode
    await act(async () => {
      result.current.toggleEditMode();
    });
    expect(result.current.editMode).toBe(true);

    // Trigger save — the onError callback fires
    await act(async () => {
      result.current.toggleEditMode();
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
    (useProductQuery as jest.Mock).mockReturnValue({ data: mockProduct, isLoading: false });
    (useSaveProductMutation as jest.Mock).mockReturnValue({ mutate: jest.fn() });
    (useDeleteProductMutation as jest.Mock).mockReturnValue({ mutate: mockDeleteMutate });

    const { result } = renderHook(() => useProductForm('123'), { wrapper });
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

  it('sets the new id and marks the draft as just created after saving a new product', async () => {
    const mockMutate = jest.fn(
      (_payload: unknown, options: { onSuccess?: (savedId: number) => void }) =>
        options.onSuccess?.(987),
    );
    (useProductQuery as jest.Mock).mockReturnValue({ data: undefined, isLoading: false });
    (useSaveProductMutation as jest.Mock).mockReturnValue({ mutate: mockMutate });
    (useDeleteProductMutation as jest.Mock).mockReturnValue({ mutate: jest.fn() });
    (consumeNewProductIntent as jest.Mock).mockReturnValue({
      name: 'Draft',
      isComponent: true,
      parentID: 42,
    });

    const { result } = renderHook(() => useProductForm('new'), { wrapper });

    await waitFor(() => expect(result.current.isNew).toBe(true));

    await act(async () => {
      result.current.toggleEditMode();
    });

    expect(mockMutate).toHaveBeenCalled();
    expect(mockSetParams).toHaveBeenCalledWith({ id: '987' });
    await waitFor(() => {
      expect(result.current.justCreated).toBe(true);
    });
  });
});
