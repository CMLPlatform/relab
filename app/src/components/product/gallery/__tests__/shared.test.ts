import { describe, expect, it } from '@jest/globals';
import {
  buildGalleryMedia,
  galleryItemAltText,
  galleryItemKeyExtractor,
} from '@/components/product/gallery/shared';
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

  it('carries the API derivatives and keeps the original reachable', () => {
    const { items } = buildGalleryMedia(
      product([
        {
          id: 'a',
          url: 'https://cdn.test/a.jpg',
          thumbnailUrl: 'https://cdn.test/a_200.webp',
          thumbnailUrls: { 200: 'https://cdn.test/a_200.webp', 800: 'https://cdn.test/a_800.webp' },
          description: '',
        },
      ]),
    );

    expect(items[0].sources).toEqual({
      200: 'https://cdn.test/a_200.webp',
      800: 'https://cdn.test/a_800.webp',
    });
    // Both tiers still default to the original here; the screen size that
    // narrows them is only known in useProductGalleryMedia.
    expect(items[0].originalUrl).toBe('https://cdn.test/a.jpg');
    expect(items[0].mediumUrl).toBe('https://cdn.test/a.jpg');
  });

  it('shapes the derivatives for expo-image, deriving each height from the aspect', () => {
    const { items } = buildGalleryMedia(
      product([
        {
          id: 'a',
          url: 'https://cdn.test/a.jpg',
          thumbnailUrls: { 800: 'https://cdn.test/a_800.webp', 200: 'https://cdn.test/a_200.webp' },
          width: 4000,
          height: 3000,
          description: '',
        },
      ]),
    );

    // Narrowest first, each height following the original's 4:3.
    expect(items[0].sourceSet).toEqual([
      { uri: 'https://cdn.test/a_200.webp', width: 200, height: 150 },
      { uri: 'https://cdn.test/a_800.webp', width: 800, height: 600 },
    ]);
  });

  it('offers no source array when the API has no dimensions for the image', () => {
    // Widths alone would leave expo-image's selection guessing, so the caller
    // falls back to picking a single URL by screen size instead.
    const { items } = buildGalleryMedia(
      product([
        {
          id: 'a',
          url: 'https://cdn.test/a.jpg',
          thumbnailUrls: { 200: 'https://cdn.test/a_200.webp', 800: 'https://cdn.test/a_800.webp' },
          description: '',
        },
      ]),
    );

    expect(items[0].sourceSet).toEqual([]);
    expect(Object.keys(items[0].sources)).toHaveLength(2);
  });

  it('drops an unsafe derivative without losing the slide', () => {
    const { items } = buildGalleryMedia(
      product([
        {
          id: 'a',
          url: 'https://cdn.test/a.jpg',
          thumbnailUrls: { 200: 'https://cdn.test/a_200.webp', 800: 'javascript:alert(1)' },
          description: '',
        },
      ]),
    );

    expect(items[0].sources).toEqual({ 200: 'https://cdn.test/a_200.webp' });
  });

  it('emits an empty source map when the API published no derivatives', () => {
    const { items } = buildGalleryMedia(
      product([{ id: 'a', url: 'https://cdn.test/a.jpg', description: '' }]),
    );

    expect(items[0].sources).toEqual({});
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

  describe('galleryItemAltText', () => {
    function item(description: string) {
      return buildGalleryMedia(product([{ id: 'a', url: 'https://cdn.test/a.jpg', description }]))
        .items[0];
    }

    it('uses the image description when present', () => {
      expect(galleryItemAltText(item('Close-up of the motor housing'), 0, 1, 'Drill')).toBe(
        'Close-up of the motor housing',
      );
    });

    it('falls back to the product name with no position suffix when there is one image', () => {
      expect(galleryItemAltText(item(''), 0, 1, 'Drill')).toBe('Drill');
    });

    it('appends a 1-based position to the fallback name when there are multiple images', () => {
      expect(galleryItemAltText(item(''), 0, 3, 'Drill')).toBe('Drill 1');
      expect(galleryItemAltText(item(''), 2, 3, 'Drill')).toBe('Drill 3');
    });

    it('falls back to a generic label when there is no name either', () => {
      expect(galleryItemAltText(item(''), 0, 1, '')).toBe('Product image');
    });
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
