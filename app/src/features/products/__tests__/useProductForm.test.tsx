import { describe, expect, it, jest } from '@jest/globals';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type React from 'react';
import { useDialog } from '@/components/base/dialogContext';
import {
  useBaseProductQuery,
  useDeleteProductMutation,
  useSaveProductMutation,
} from '@/features/products/queries';
import { useProductForm } from '@/features/products/useProductForm';
import { baseProduct } from '@/test-utils/index';
import type { Product } from '@/types/Product';

jest.mock('@/components/base/dialogContext', () => {
  const actual = jest.requireActual<typeof import('@/components/base/dialogContext')>(
    '@/components/base/dialogContext',
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

jest.mock('@/features/products/queries', () => ({
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
  ...baseProduct,
  id: 123,
  brand: 'CircularTech',
  physicalProperties: { weight: 0, width: 0, height: 0, depth: 0 },
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

  it('routes delete through onDeleteSuccess when provided instead of the root list', async () => {
    const mockDeleteMutate = jest.fn((_payload: unknown, options: { onSuccess?: () => void }) =>
      options.onSuccess?.(),
    );
    const onDeleteSuccess = jest.fn();
    (useBaseProductQuery as jest.Mock).mockReturnValue({ data: mockProduct, isLoading: false });
    (useSaveProductMutation as jest.Mock).mockReturnValue({ mutate: jest.fn() });
    (useDeleteProductMutation as jest.Mock).mockReturnValue({ mutate: mockDeleteMutate });

    const { result } = renderHook(
      () => useProductForm('123', { role: 'product', onDeleteSuccess }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.product.id).toBe(123));

    await act(async () => {
      result.current.onProductDelete();
    });

    expect(onDeleteSuccess).toHaveBeenCalledTimes(1);
    expect(mockReplace).not.toHaveBeenCalledWith('/products');
  });

  it('reports errorCount and firstErrorSection from the current validation errors', async () => {
    // Start from a fully valid product (unlike mockProduct, whose zeroed-out
    // physicalProperties already fail validation on mount) so the two fields
    // we invalidate below are the only — and orderly — error sources.
    const validProduct = {
      ...mockProduct,
      physicalProperties: { weight: 850, width: 30, height: 12, depth: 25 },
    };
    (useBaseProductQuery as jest.Mock).mockReturnValue({ data: validProduct, isLoading: false });
    (useSaveProductMutation as jest.Mock).mockReturnValue({ mutate: jest.fn() });
    (useDeleteProductMutation as jest.Mock).mockReturnValue({ mutate: jest.fn() });

    const { result } = renderHook(
      () => useProductForm('123', { role: 'product', initialEditMode: true }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.product.id).toBe(123));
    await waitFor(() => expect(result.current.validationResult.isValid).toBe(true));

    // Two genuinely failing fields per productSchema, invalidated in order: name
    // below the 2-char minimum first, then a negative weight (schema requires
    // positive-or-NaN) — so 'name' is the first error key and maps to 'overview'.
    await act(async () => {
      result.current.onProductNameChange('A');
    });
    await waitFor(() => expect(result.current.validationResult.errorCount).toBe(1));

    await act(async () => {
      result.current.onChangePhysicalProperties({
        ...result.current.product.physicalProperties,
        weight: -5,
      });
    });

    await waitFor(() => {
      expect(result.current.validationResult.errorCount).toBe(2);
      expect(result.current.validationResult.firstErrorSection).toBe('overview');
    });
  });

  // Regression: delete had no onError handler, so a failed delete was swallowed
  // by react-query — the entity stayed on screen with no feedback.
  it('surfaces a dialog when the delete mutation fails', async () => {
    const mockAlert = jest.fn();
    jest
      .mocked(useDialog)
      .mockReturnValue({ alert: mockAlert, input: jest.fn(), toast: jest.fn() });
    const deleteMutate = jest.fn((_product, opts: { onError?: (err: unknown) => void }) =>
      opts.onError?.(new Error('server exploded')),
    );
    (useBaseProductQuery as jest.Mock).mockReturnValue({ data: mockProduct, isLoading: false });
    (useSaveProductMutation as jest.Mock).mockReturnValue({ mutate: jest.fn() });
    (useDeleteProductMutation as jest.Mock).mockReturnValue({ mutate: deleteMutate });

    const { result } = renderHook(
      () => useProductForm('123', { role: 'product', initialEditMode: true }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.product.id).toBe(123));

    await act(async () => {
      result.current.onProductDelete();
    });

    expect(mockAlert).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Delete failed', message: 'server exploded' }),
    );
  });
});
