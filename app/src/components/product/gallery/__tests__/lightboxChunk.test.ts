import { describe, expect, it, jest } from '@jest/globals';

jest.mock('@/components/product/gallery/ProductImageLightbox', () => {
  throw new Error('chunk failed to load');
});

describe('prefetchLightbox', () => {
  it('swallows a failed chunk load', async () => {
    const { loadLightbox, prefetchLightbox } = await import(
      '@/components/product/gallery/lightboxChunk'
    );
    await expect(loadLightbox()).rejects.toThrow('chunk failed to load');

    expect(prefetchLightbox()).toBeUndefined();
    // Let the rejection settle; an unhandled one would fail the run.
    await new Promise((resolve) => setImmediate(resolve));
  });
});
