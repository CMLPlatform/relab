import { describe, expect, it, jest } from '@jest/globals';
import { renderHook } from '@testing-library/react-native';

import { useProductGalleryMedia } from '@/features/products/productGalleryViewer';
import type { Product } from '@/types/Product';

// Mutated per test, read through the module mock below. jest.spyOn does not
// take on react-native's re-exported hook binding, which silently left the
// runner's own 750x2 default in place.
let mockWindow = { width: 390, height: 844, scale: 3, fontScale: 1 };

jest.mock('react-native', () => {
  // Mutate in place rather than spreading the module namespace — spreading
  // forces eager evaluation of unrelated lazy native-module getters that throw
  // outside the real native runtime (same reason as AppButton.test.tsx).
  const actual = jest.requireActual<typeof import('react-native')>('react-native');
  // Plain assignment does not stick on the module namespace: it silently keeps
  // the real hook, and the runner's own 750x2 default then happens to satisfy
  // any assertion expecting the largest derivative.
  Object.defineProperty(actual, 'useWindowDimensions', {
    configurable: true,
    value: () => mockWindow,
  });
  actual.PixelRatio.get = () => mockWindow.scale;
  return actual;
});

/** Pin the screen so the picked width is a property of the code, not the runner. */
function onScreen(width: number, height: number, scale: number) {
  mockWindow = { width, height, scale, fontScale: 1 };
}

function product(thumbnailUrls?: Record<number, string>): Product {
  return {
    id: 1,
    name: 'HP ProBook',
    images: [
      {
        id: 'a',
        url: 'https://cdn.test/original.jpg',
        thumbnailUrl: 'https://cdn.test/a_200.webp',
        thumbnailUrls,
        description: '',
      },
    ],
  } as Product;
}

const DERIVATIVES = {
  200: 'https://cdn.test/a_200.webp',
  800: 'https://cdn.test/a_800.webp',
  1600: 'https://cdn.test/a_1600.webp',
};

describe('useProductGalleryMedia', () => {
  afterEach(() => {
    mockWindow = { width: 390, height: 844, scale: 3, fontScale: 1 };
  });

  it('sizes the pager image to the screen instead of pulling the original', () => {
    onScreen(390, 844, 3); // 390pt at 3x needs 1170px.
    const { result } = renderHook(() => useProductGalleryMedia(product(DERIVATIVES)));

    expect(result.current.items[0].mediumUrl).toBe('https://cdn.test/a_1600.webp');
    expect(result.current.items[0].mediumUrl).not.toBe('https://cdn.test/original.jpg');
  });

  it('takes a smaller derivative on a smaller screen', () => {
    onScreen(320, 568, 2); // 640px needed, so the 800 covers it.
    const { result } = renderHook(() => useProductGalleryMedia(product(DERIVATIVES)));

    expect(result.current.items[0].mediumUrl).toBe('https://cdn.test/a_800.webp');
  });

  it('prefetches the sized image, not the full-resolution upload', () => {
    onScreen(390, 844, 3);
    const { result } = renderHook(() => useProductGalleryMedia(product(DERIVATIVES)));

    expect(result.current.prefetchUrls).toEqual(['https://cdn.test/a_1600.webp']);
  });

  it('keeps the original for the lightbox to zoom into', () => {
    onScreen(390, 844, 3);
    const { result } = renderHook(() => useProductGalleryMedia(product(DERIVATIVES)));

    expect(result.current.items[0].originalUrl).toBe('https://cdn.test/original.jpg');
  });

  it('falls back to the original when the API published no derivatives', () => {
    onScreen(390, 844, 3);
    const { result } = renderHook(() => useProductGalleryMedia(product(undefined)));

    expect(result.current.items[0].mediumUrl).toBe('https://cdn.test/original.jpg');
    expect(result.current.items[0].largeUrl).toBe('https://cdn.test/original.jpg');
  });
});
