import { describe, expect, it, jest } from '@jest/globals';
import { act, renderHook } from '@testing-library/react-native';
import { buildGalleryMedia } from '@/components/product/gallery/shared';
import { useProductGalleryImageActions } from '@/features/products/productGalleryCapture';
import type { Product } from '@/types/Product';

jest.mock('expo-image-picker', () => ({
  launchCameraAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
  requestCameraPermissionsAsync: jest.fn(),
}));

const IMAGES = [
  { id: 'a', url: 'https://cdn.test/a.jpg', description: '' },
  // The stored file is gone, so the API returns an empty url and this image
  // renders as a placeholder — but it is still one of the product's images.
  { id: 'missing', url: '', description: '' },
  { id: 'c', url: 'https://cdn.test/c.jpg', description: '' },
];

function setup(onImagesChange: (images: unknown[]) => void) {
  const product = { id: 1, name: 'Drill', images: IMAGES } as Product;
  const { images, items } = buildGalleryMedia(product);
  const media = { images, items, imageCount: items.length, width: 320, prefetchUrls: [] };
  const viewerState = { updateCurrentIndex: jest.fn(async () => {}) };

  return renderHook(() =>
    useProductGalleryImageActions({
      media: media as never,
      viewerState: viewerState as never,
      onImagesChange: onImagesChange as never,
    }),
  );
}

describe('useProductGalleryImageActions', () => {
  // Regression: the actions wrote back the URL-filtered display array, so any
  // image whose file was missing on disk was silently deleted from the product
  // the next time the user added or removed a photo.
  it('deleting a visible image preserves an image whose url did not resolve', async () => {
    const onImagesChange = jest.fn();
    const { result } = setup(onImagesChange);

    await act(async () => {
      result.current.handleDeleteImage(0);
    });

    expect(onImagesChange).toHaveBeenCalledWith([
      { id: 'missing', url: '', description: '' },
      { id: 'c', url: 'https://cdn.test/c.jpg', description: '' },
    ]);
  });

  it('deletes the row the user is actually looking at', async () => {
    const onImagesChange = jest.fn();
    const { result } = setup(onImagesChange);

    // Index 2 is the third slide; with the old filtering it addressed image 'c'
    // via a two-element array and would have thrown the index away.
    await act(async () => {
      result.current.handleDeleteImage(2);
    });

    expect(onImagesChange).toHaveBeenCalledWith([
      { id: 'a', url: 'https://cdn.test/a.jpg', description: '' },
      { id: 'missing', url: '', description: '' },
    ]);
  });

  it('deleting the unresolvable image itself removes exactly that row', async () => {
    const onImagesChange = jest.fn();
    const { result } = setup(onImagesChange);

    await act(async () => {
      result.current.handleDeleteImage(1);
    });

    expect(onImagesChange).toHaveBeenCalledWith([
      { id: 'a', url: 'https://cdn.test/a.jpg', description: '' },
      { id: 'c', url: 'https://cdn.test/c.jpg', description: '' },
    ]);
  });
});
