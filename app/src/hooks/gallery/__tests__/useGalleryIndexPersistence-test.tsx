import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useGalleryIndexPersistence } from '@/hooks/gallery/useGalleryIndexPersistence';

const mockGetLocalItem: jest.MockedFunction<(key: string) => Promise<string | null>> = jest.fn();
const mockSetLocalItem: jest.MockedFunction<(key: string, value: string) => Promise<void>> =
  jest.fn();

jest.mock('@/services/storage', () => ({
  getLocalItem: (key: string) => mockGetLocalItem(key),
  setLocalItem: (key: string, value: string) => mockSetLocalItem(key, value),
}));

describe('useGalleryIndexPersistence', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('restores a saved index when product and image count are valid', async () => {
    mockGetLocalItem.mockResolvedValueOnce('1');

    const { result } = renderHook(() =>
      useGalleryIndexPersistence({ productId: 42, imageCount: 3 }),
    );

    await waitFor(() => {
      expect(result.current.pendingIndex).toBe(1);
    });

    expect(mockGetLocalItem).toHaveBeenCalledWith('product_gallery_index_42');
  });

  it('ignores missing, invalid, and out-of-range saved values', async () => {
    mockGetLocalItem.mockResolvedValueOnce(null);
    const first = renderHook(() => useGalleryIndexPersistence({ productId: 42, imageCount: 3 }));
    await waitFor(() => {
      expect(first.result.current.pendingIndex).toBeNull();
    });

    mockGetLocalItem.mockResolvedValueOnce('nope');
    const second = renderHook(() => useGalleryIndexPersistence({ productId: 42, imageCount: 3 }));
    await waitFor(() => {
      expect(second.result.current.pendingIndex).toBeNull();
    });

    mockGetLocalItem.mockResolvedValueOnce('9');
    const third = renderHook(() => useGalleryIndexPersistence({ productId: 42, imageCount: 3 }));
    await waitFor(() => {
      expect(third.result.current.pendingIndex).toBeNull();
    });
  });

  it('persists the selected index', async () => {
    const { result } = renderHook(() =>
      useGalleryIndexPersistence({ productId: 42, imageCount: 3 }),
    );

    await act(async () => {
      await result.current.persistIndex(2);
    });

    expect(mockSetLocalItem).toHaveBeenCalledWith('product_gallery_index_42', '2');
  });

  it('clears the pending index after consumption', async () => {
    mockGetLocalItem.mockResolvedValueOnce('1');

    const { result } = renderHook(() =>
      useGalleryIndexPersistence({ productId: 42, imageCount: 3 }),
    );

    await waitFor(() => {
      expect(result.current.pendingIndex).toBe(1);
    });

    act(() => {
      result.current.consumePendingIndex();
    });

    expect(result.current.pendingIndex).toBeNull();
  });
});
