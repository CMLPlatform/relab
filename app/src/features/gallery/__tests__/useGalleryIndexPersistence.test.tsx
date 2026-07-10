import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useGalleryIndexPersistence } from '@/features/gallery/useGalleryIndexPersistence';

const mockGetLocalItem: jest.MockedFunction<(key: string) => Promise<string | null>> = jest.fn();
const mockSetLocalItem: jest.MockedFunction<(key: string, value: string) => Promise<void>> =
  jest.fn();

jest.mock('@/services/storage', () => ({
  getLocalItem: (key: string) => mockGetLocalItem(key),
  setLocalItem: (key: string, value: string) => mockSetLocalItem(key, value),
}));

/** Let the async storage read and the restore callback settle before asserting. */
async function flushLoad() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function render({
  productId = 42 as number | null,
  imageCount = 3,
}: {
  productId?: number | null;
  imageCount?: number;
} = {}) {
  const onRestore = jest.fn();
  const hook = renderHook(() => useGalleryIndexPersistence({ productId, imageCount, onRestore }));
  return { ...hook, onRestore };
}

describe('useGalleryIndexPersistence', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetLocalItem.mockResolvedValue(null);
    mockSetLocalItem.mockResolvedValue(undefined);
  });

  it('restores a saved index for the product', async () => {
    mockGetLocalItem.mockResolvedValueOnce('2');

    const { onRestore } = render();
    await flushLoad();

    expect(mockGetLocalItem).toHaveBeenCalledWith('product_gallery_index_42');
    expect(onRestore).toHaveBeenCalledWith(2);
  });

  it('does nothing when no index was saved', async () => {
    mockGetLocalItem.mockResolvedValueOnce(null);

    const { onRestore } = render();
    await flushLoad();

    expect(onRestore).not.toHaveBeenCalled();
  });

  it('does not read storage for an unsaved product', async () => {
    render({ productId: null });
    await flushLoad();

    expect(mockGetLocalItem).not.toHaveBeenCalled();
  });

  it('does not read storage when the product has no images', async () => {
    render({ imageCount: 0 });
    await flushLoad();

    expect(mockGetLocalItem).not.toHaveBeenCalled();
  });

  describe('saved-index bounds', () => {
    // Regression: only the upper bound was covered, so `index >= 0 &&` could be
    // deleted with the suite green.
    it.each([['-1'], ['-42']])('ignores a negative saved index (%s)', async (saved) => {
      mockGetLocalItem.mockResolvedValueOnce(saved);

      const { onRestore } = render();
      await flushLoad();

      expect(onRestore).not.toHaveBeenCalled();
    });

    it.each([['3'], ['9']])('ignores an out-of-range saved index (%s)', async (saved) => {
      mockGetLocalItem.mockResolvedValueOnce(saved);

      const { onRestore } = render({ imageCount: 3 });
      await flushLoad();

      expect(onRestore).not.toHaveBeenCalled();
    });

    it('ignores a non-numeric saved index', async () => {
      mockGetLocalItem.mockResolvedValueOnce('not-a-number');

      const { onRestore } = render();
      await flushLoad();

      expect(onRestore).not.toHaveBeenCalled();
    });
  });

  // Regression: `if (productId && ...)` treated product id 0 as "no product",
  // while the new-product check elsewhere is `productId === null`.
  it('restores for product id 0, which is a real product', async () => {
    mockGetLocalItem.mockResolvedValueOnce('1');

    const { onRestore } = render({ productId: 0 });
    await flushLoad();

    expect(mockGetLocalItem).toHaveBeenCalledWith('product_gallery_index_0');
    expect(onRestore).toHaveBeenCalledWith(1);
  });

  it('does not restore after unmount', async () => {
    let release: (value: string | null) => void = () => {};
    mockGetLocalItem.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );

    const { onRestore, unmount } = render();
    await waitFor(() => expect(mockGetLocalItem).toHaveBeenCalled());
    unmount();

    await act(async () => {
      release('1');
      await Promise.resolve();
    });

    expect(onRestore).not.toHaveBeenCalled();
  });

  describe('persistIndex', () => {
    it('writes the index under the product key', async () => {
      const { result } = render();

      await result.current.persistIndex(2);

      expect(mockSetLocalItem).toHaveBeenCalledWith('product_gallery_index_42', '2');
    });

    it('never writes an index for an unsaved product', async () => {
      const { result } = render({ productId: null });

      await result.current.persistIndex(2);

      expect(mockSetLocalItem).not.toHaveBeenCalled();
    });

    it('swallows a storage failure', async () => {
      mockSetLocalItem.mockRejectedValueOnce(new Error('quota'));
      const { result } = render();

      await expect(result.current.persistIndex(1)).resolves.toBeUndefined();
    });
  });
});
