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

// Deleting a photo removes it immediately and offers an Undo on the toast —
// removal is draft-local until the record is saved, so nothing is confirmed.
// `toastCalls` captures the message and its action so a test can press Undo.
const toastCalls: { message: string; action?: { label: string; onPress: () => void } }[] = [];
jest.mock('@/hooks/useAppFeedback', () => ({
  useAppFeedback: () => ({
    alert: jest.fn(),
    error: jest.fn(),
    input: jest.fn(),
    toast: (message: string, action?: { label: string; onPress: () => void }) => {
      toastCalls.push({ message, action });
    },
  }),
}));

const IMAGES = [
  { id: 'a', url: 'https://cdn.test/a.jpg', description: '' },
  // The stored file is gone, so the API returns an empty url and this image
  // renders as a placeholder — but it is still one of the product's images.
  { id: 'missing', url: '', description: '' },
  { id: 'c', url: 'https://cdn.test/c.jpg', description: '' },
];

type GalleryImage = { id?: string; url: string; description: string };

// Parameterised on the image list so a test can re-render the hook with a
// changed array — the state the undo action reads back through.
function setup(onImagesChange: (images: unknown[]) => void) {
  const viewerState = { updateCurrentIndex: jest.fn(async () => {}) };

  return renderHook(
    ({ productImages }: { productImages: GalleryImage[] }) => {
      const product = { id: 1, name: 'Drill', images: productImages } as Product;
      const { images, items } = buildGalleryMedia(product);
      const media = { images, items, imageCount: items.length, width: 320, prefetchUrls: [] };
      return useProductGalleryImageActions({
        media: media as never,
        viewerState: viewerState as never,
        onImagesChange: onImagesChange as never,
      });
    },
    { initialProps: { productImages: IMAGES as GalleryImage[] } },
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

describe('undo', () => {
  it('offers an Undo action on the removal toast', async () => {
    toastCalls.length = 0;
    const onImagesChange = jest.fn();
    const { result } = setup(onImagesChange);

    await act(async () => {
      result.current.handleDeleteImage(0);
    });

    expect(toastCalls).toHaveLength(1);
    expect(toastCalls[0]?.message).toBe('Photo removed');
    expect(toastCalls[0]?.action?.label).toBe('Undo');
  });

  it('undo puts the photo back at the index it came from', async () => {
    toastCalls.length = 0;
    const onImagesChange = jest.fn();
    const { result } = setup(onImagesChange);

    await act(async () => {
      result.current.handleDeleteImage(1);
    });
    await act(async () => {
      toastCalls[0]?.action?.onPress();
    });

    expect(onImagesChange).toHaveBeenLastCalledWith(IMAGES);
  });

  // The window is long enough to import a photo in. Restoring a snapshot taken
  // before that import would delete it — the same silent-loss bug the
  // url-filtering regression above guards against, one step later.
  it('undo keeps a photo added during the undo window', async () => {
    toastCalls.length = 0;
    const added = { url: 'data:image/png;base64,x', description: '' };
    const onImagesChange = jest.fn();
    const { result, rerender } = setup(onImagesChange);

    await act(async () => {
      result.current.handleDeleteImage(0);
    });
    // A photo is imported before the toast expires, so the form re-renders with
    // the shortened list plus the new import.
    rerender({ productImages: [IMAGES[1], IMAGES[2], added] });
    await act(async () => {
      toastCalls[0]?.action?.onPress();
    });

    expect(onImagesChange).toHaveBeenLastCalledWith([IMAGES[0], IMAGES[1], IMAGES[2], added]);
  });
});
