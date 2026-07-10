import { describe, expect, it } from '@jest/globals';
import { buildGalleryMedia, galleryItemKeyExtractor } from '@/components/product/gallery/shared';
import type { Product } from '@/types/Product';

function product(images: Product['images']): Product {
  return { id: 1, name: 'Drill', images } as Product;
}

describe('buildGalleryMedia', () => {
  // Regression: unresolvable images used to be filtered out, so the display array
  // was shorter than product.images. The add/delete actions wrote that shorter
  // array back and permanently deleted the hidden rows.
  it('emits exactly one item per product image, in source order', () => {
    const images = [
      { id: 'a', url: 'https://cdn.test/a.jpg', description: '' },
      // The backend returns an empty url when the stored file is missing.
      { id: 'b', url: '', description: '' },
      { id: 'c', url: 'https://cdn.test/c.jpg', description: '' },
    ];

    const { items, images: source } = buildGalleryMedia(product(images));

    expect(items).toHaveLength(3);
    expect(items.map((item) => item.image.id)).toEqual(['a', 'b', 'c']);
    expect(source).toBe(images);
  });

  it('resolves a missing url to null rather than dropping the slide', () => {
    const { items } = buildGalleryMedia(product([{ id: 'b', url: '', description: '' }]));

    expect(items[0]?.mediumUrl).toBeNull();
    expect(items[0]?.largeUrl).toBeNull();
    expect(items[0]?.thumbnailUrl).toBeNull();
  });

  it('rejects an unsafe url instead of rendering it', () => {
    const { items } = buildGalleryMedia(
      product([{ id: 'x', url: 'javascript:alert(1)', description: '' }]),
    );

    expect(items).toHaveLength(1);
    expect(items[0]?.mediumUrl).toBeNull();
  });

  it('keeps locally-picked file/blob urls', () => {
    const { items } = buildGalleryMedia(
      product([{ url: 'file:///tmp/pick.jpg', description: '' }]),
    );

    expect(items[0]?.mediumUrl).toBe('file:///tmp/pick.jpg');
  });

  it('falls back to the full image when no thumbnail is supplied', () => {
    const { items } = buildGalleryMedia(
      product([{ id: 'a', url: 'https://cdn.test/a.jpg', description: '' }]),
    );

    expect(items[0]?.thumbnailUrl).toBe('https://cdn.test/a.jpg');
  });

  describe('keys', () => {
    it('keys by image id so deleting a row does not re-key its neighbours', () => {
      const { items } = buildGalleryMedia(
        product([
          { id: 'a', url: 'https://cdn.test/a.jpg', description: '' },
          { id: 'b', url: 'https://cdn.test/b.jpg', description: '' },
        ]),
      );

      expect(items.map(galleryItemKeyExtractor)).toEqual(['a', 'b']);
    });

    it('falls back to the url for locally-picked images that have no id yet', () => {
      const { items } = buildGalleryMedia(
        product([{ url: 'file:///tmp/pick.jpg', description: '' }]),
      );

      expect(galleryItemKeyExtractor(items[0])).toBe('file:///tmp/pick.jpg');
    });

    it('gives idless, urlless images distinct keys', () => {
      const { items } = buildGalleryMedia(
        product([
          { url: '', description: '' },
          { url: '', description: '' },
        ]),
      );

      const keys = items.map(galleryItemKeyExtractor);
      expect(new Set(keys).size).toBe(2);
    });
  });
});
