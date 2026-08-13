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
import { MediaSyncError } from '@/services/api/saving';
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
    (useSaveProductMutation as jest.Mock).mockReturnValue({
      mutateAsync: jest.fn(async () => 123),
    });
    (useDeleteProductMutation as jest.Mock).mockReturnValue({
      mutateAsync: jest.fn(async () => undefined),
    });

    const { result } = renderHook(() => useProductForm('123', { role: 'product' }), { wrapper });

    await waitFor(() => {
      expect(result.current.product.id).toBe(123);
      expect(result.current.product.name).toBe('Recycled Aluminum Laptop Stand');
      expect(result.current.editMode).toBe(false);
    });
  });

  it('handles field changes', async () => {
    (useBaseProductQuery as jest.Mock).mockReturnValue({ data: mockProduct, isLoading: false });
    (useSaveProductMutation as jest.Mock).mockReturnValue({
      mutateAsync: jest.fn(async () => 123),
    });
    (useDeleteProductMutation as jest.Mock).mockReturnValue({
      mutateAsync: jest.fn(async () => undefined),
    });

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
    const mockMutate = jest.fn(async () => 123);
    (useBaseProductQuery as jest.Mock).mockReturnValue({ data: mockProduct, isLoading: false });
    (useSaveProductMutation as jest.Mock).mockReturnValue({ mutateAsync: mockMutate });
    (useDeleteProductMutation as jest.Mock).mockReturnValue({
      mutateAsync: jest.fn(async () => undefined),
    });

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
        // Updates PATCH — naturally idempotent, no key needed.
        idempotencyKey: undefined,
      }),
    );
  });

  // The key must be generated where the user initiates the save (here), not
  // inside saveProductMutationFn — that function also drives resumed,
  // rehydrated mutations, where minting a fresh key would rotate it and defeat
  // dedup against the request the app already sent before it was interrupted.
  it('generates an idempotencyKey for a new (id-less) product create', async () => {
    const mockMutate = jest.fn(async () => 55);
    (useBaseProductQuery as jest.Mock).mockReturnValue({ data: undefined, isLoading: false });
    (useSaveProductMutation as jest.Mock).mockReturnValue({ mutateAsync: mockMutate });
    (useDeleteProductMutation as jest.Mock).mockReturnValue({
      mutateAsync: jest.fn(async () => undefined),
    });

    const { result } = renderHook(
      () => useProductForm(undefined, { role: 'product', initialEditMode: true }),
      { wrapper },
    );

    await act(async () => {
      result.current.onProductNameChange('Brand New');
    });

    await act(async () => {
      result.current.saveAndExit();
    });

    expect(mockMutate).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: expect.any(String) }),
    );
  });

  // Regression: the button stays pressable while the save is in flight, so a
  // double tap issued a second PATCH and re-uploaded every pending photo.
  it('ignores a second saveAndExit while the first is still in flight', async () => {
    let release: (id: number) => void = () => {};
    const mockMutate = jest.fn(() => new Promise<number>((resolve) => (release = resolve)));
    (useBaseProductQuery as jest.Mock).mockReturnValue({ data: mockProduct, isLoading: false });
    (useSaveProductMutation as jest.Mock).mockReturnValue({ mutateAsync: mockMutate });
    (useDeleteProductMutation as jest.Mock).mockReturnValue({
      mutateAsync: jest.fn(async () => undefined),
    });

    const { result } = renderHook(
      () => useProductForm('123', { role: 'product', initialEditMode: true }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.product.id).toBe(123));

    await act(async () => {
      result.current.onProductNameChange('Edited Name');
    });

    await act(async () => {
      void result.current.saveAndExit();
      void result.current.saveAndExit();
    });

    expect(mockMutate).toHaveBeenCalledTimes(1);

    await act(async () => {
      release(123);
    });
  });

  it('calls onSaveSuccess with the current id when saveAndExit is called on a clean existing entity', async () => {
    const onSaveSuccess = jest.fn();
    (useBaseProductQuery as jest.Mock).mockReturnValue({ data: mockProduct, isLoading: false });
    (useSaveProductMutation as jest.Mock).mockReturnValue({
      mutateAsync: jest.fn(async () => 123),
    });
    (useDeleteProductMutation as jest.Mock).mockReturnValue({
      mutateAsync: jest.fn(async () => undefined),
    });

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
    const mockAlert = jest.fn();
    jest
      .mocked(useDialog)
      .mockReturnValue({ alert: mockAlert, input: jest.fn(), toast: jest.fn() });
    const mockMutate = jest.fn(async () => {
      throw new Error('Network failure');
    });
    (useBaseProductQuery as jest.Mock).mockReturnValue({ data: mockProduct, isLoading: false });
    (useSaveProductMutation as jest.Mock).mockReturnValue({ mutateAsync: mockMutate });
    (useDeleteProductMutation as jest.Mock).mockReturnValue({
      mutateAsync: jest.fn(async () => undefined),
    });

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

    expect(mockAlert).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Save failed', message: 'Network failure' }),
    );
  });

  // A media-sync failure means the entity itself saved: the caller must hear
  // "photos didn't upload", not "save failed", and must not be exited out of
  // the form while those photos are still only local.
  it('reports a partial save honestly and stays in the form', async () => {
    const mockAlert = jest.fn();
    jest
      .mocked(useDialog)
      .mockReturnValue({ alert: mockAlert, input: jest.fn(), toast: jest.fn() });
    const onSaveSuccess = jest.fn();
    (useBaseProductQuery as jest.Mock).mockReturnValue({ data: mockProduct, isLoading: false });
    (useSaveProductMutation as jest.Mock).mockReturnValue({
      mutateAsync: jest.fn(async () => {
        throw new MediaSyncError(123, new Error('413'));
      }),
    });
    (useDeleteProductMutation as jest.Mock).mockReturnValue({
      mutateAsync: jest.fn(async () => undefined),
    });

    const { result } = renderHook(
      () => useProductForm('123', { role: 'product', initialEditMode: true, onSaveSuccess }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.product.id).toBe(123));

    await act(async () => {
      result.current.onProductNameChange('Edited Name');
    });
    await act(async () => {
      result.current.saveAndExit();
    });

    expect(mockAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Photos not uploaded',
        message: 'Saved, but some photos failed to upload.',
      }),
    );
    expect(onSaveSuccess).not.toHaveBeenCalled();
  });

  it('calls delete mutation and navigates to /products on success', async () => {
    const mockDeleteMutate = jest.fn(async () => undefined);
    (useBaseProductQuery as jest.Mock).mockReturnValue({ data: mockProduct, isLoading: false });
    (useSaveProductMutation as jest.Mock).mockReturnValue({
      mutateAsync: jest.fn(async () => 123),
    });
    (useDeleteProductMutation as jest.Mock).mockReturnValue({ mutateAsync: mockDeleteMutate });

    const { result } = renderHook(() => useProductForm('123', { role: 'product' }), { wrapper });
    await waitFor(() => expect(result.current.product.id).toBe(123));

    await act(async () => {
      result.current.onProductDelete();
    });

    expect(mockDeleteMutate).toHaveBeenCalledWith(expect.objectContaining({ id: 123 }));
    expect(mockReplace).toHaveBeenCalledWith('/products');
  });

  it('routes delete through onDeleteSuccess when provided instead of the root list', async () => {
    const mockDeleteMutate = jest.fn(async () => undefined);
    const onDeleteSuccess = jest.fn();
    (useBaseProductQuery as jest.Mock).mockReturnValue({ data: mockProduct, isLoading: false });
    (useSaveProductMutation as jest.Mock).mockReturnValue({
      mutateAsync: jest.fn(async () => 123),
    });
    (useDeleteProductMutation as jest.Mock).mockReturnValue({ mutateAsync: mockDeleteMutate });

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
    (useSaveProductMutation as jest.Mock).mockReturnValue({
      mutateAsync: jest.fn(async () => 123),
    });
    (useDeleteProductMutation as jest.Mock).mockReturnValue({
      mutateAsync: jest.fn(async () => undefined),
    });

    const { result } = renderHook(
      () => useProductForm('123', { role: 'product', initialEditMode: true }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.product.id).toBe(123));
    await waitFor(() => expect(result.current.validationResult.isValid).toBe(true));

    // Two genuinely failing fields per productSchema: name below the 2-char
    // minimum, then a negative weight (schema requires positive-or-NaN).
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

  // Regression: firstErrorSection used to read react-hook-form's first error
  // key, whose order follows when each field failed — invalidating a lower
  // section first scrolled past the invalid field above it.
  it('reports the visually first error section regardless of which field failed first', async () => {
    const validProduct = {
      ...mockProduct,
      physicalProperties: { weight: 850, width: 30, height: 12, depth: 25 },
    };
    (useBaseProductQuery as jest.Mock).mockReturnValue({ data: validProduct, isLoading: false });
    (useSaveProductMutation as jest.Mock).mockReturnValue({
      mutateAsync: jest.fn(async () => 123),
    });
    (useDeleteProductMutation as jest.Mock).mockReturnValue({
      mutateAsync: jest.fn(async () => undefined),
    });

    const { result } = renderHook(
      () => useProductForm('123', { role: 'product', initialEditMode: true }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.product.id).toBe(123));
    await waitFor(() => expect(result.current.validationResult.isValid).toBe(true));

    // Invalidate the lower section (physical) first, then the higher one
    // (overview) — the reverse of the test above.
    await act(async () => {
      result.current.onChangePhysicalProperties({
        ...result.current.product.physicalProperties,
        weight: -5,
      });
    });
    await waitFor(() => expect(result.current.validationResult.errorCount).toBe(1));

    await act(async () => {
      result.current.onProductNameChange('A');
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
    const deleteMutate = jest.fn(async () => {
      throw new Error('server exploded');
    });
    (useBaseProductQuery as jest.Mock).mockReturnValue({ data: mockProduct, isLoading: false });
    (useSaveProductMutation as jest.Mock).mockReturnValue({
      mutateAsync: jest.fn(async () => 123),
    });
    (useDeleteProductMutation as jest.Mock).mockReturnValue({ mutateAsync: deleteMutate });

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
