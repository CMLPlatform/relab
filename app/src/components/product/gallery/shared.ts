import { type GestureResponderEvent, Platform, FlatList as RNFlatList } from 'react-native';
import { FlatList as GHFlatList } from 'react-native-gesture-handler';
import { resolveApiMediaUrl } from '@/services/api/media';
import type { Product } from '@/types/Product';
import { isSafeImageUrl } from '@/utils/urlSafety';

export const GalleryFlatList: typeof GHFlatList =
  Platform.OS === 'web' ? (RNFlatList as unknown as typeof GHFlatList) : GHFlatList;

export type ScrollEvent = { nativeEvent: { contentOffset: { x: number } } };

export type ScrollableListHandle = {
  scrollToIndex(params: {
    index: number;
    animated?: boolean | null;
    viewOffset?: number;
    viewPosition?: number;
  }): void;
  scrollToOffset(params: { offset: number; animated?: boolean | null }): void;
};

export const IMAGE_HEIGHT = 300;

type ProductImage = NonNullable<Product['images']>[number];

/**
 * One gallery slide per product image, in source order: the viewer's index is
 * the index into `product.images` that add/delete write back.
 *
 * A URL is `null` when unresolvable or unsafe. Such items keep their slot and
 * render a placeholder; dropping them would shift later indexes and delete the
 * image on the next save.
 */
export type GalleryItem = {
  key: string;
  image: ProductImage;
  thumbnailUrl: string | null;
  mediumUrl: string | null;
  largeUrl: string | null;
  /** The full-resolution upload (never downscaled, can be many megabytes); for zoom only. */
  originalUrl: string | null;
  /** Width-keyed derivatives, resolved and safety-filtered. Empty when the API published none. */
  sources: Record<number, string>;
  /**
   * `sources` shaped for expo-image's `source` array (a real `srcset` on web).
   * Empty unless the API knows the original's dimensions.
   */
  sourceSet: ImageSource[];
};

/** One `source` entry: a derivative URL and the size it decodes to. */
export type ImageSource = { uri: string; width: number; height: number };

/** Builds a FlatList getItemLayout for a horizontally-paged list of fixed-width items. */
export function makeHorizontalItemLayout(width: number) {
  return (_data: ArrayLike<unknown> | null | undefined, index: number) => ({
    length: width,
    offset: width * index,
    index,
  });
}

/** Clamps `index` into the valid `[0, length - 1]` range (0 when `length` is 0). */
export function clampIndex(index: number, length: number): number {
  return Math.max(0, Math.min(index, length - 1));
}

/** Scrolls to `index`; `scrollToIndex` throws for an unmeasured target, so fall back to an offset. */
export function scrollListToIndex(
  ref: ScrollableListHandle | null,
  index: number,
  width: number,
  animated: boolean,
): void {
  try {
    ref?.scrollToIndex({ index, animated });
  } catch {
    ref?.scrollToOffset({ offset: index * width, animated });
  }
}

/** Keys rows by image identity so deleting one does not re-key its neighbours. */
export const galleryItemKeyExtractor = (item: GalleryItem) => item.key;

export function getTouchPointX(event: GestureResponderEvent, type: 'start' | 'end'): number | null {
  const touch =
    type === 'start'
      ? (event.nativeEvent.touches[0] ?? event.nativeEvent.changedTouches[0])
      : event.nativeEvent.changedTouches[0];

  return touch?.pageX ?? null;
}

/**
 * resolveApiMediaUrl is http-only; fall back to the raw url for locally-picked
 * images (file:/blob:/content:) that never hit the API.
 */
function resolveImageUrl(url: string | undefined): string | null {
  if (!url) return null;
  return resolveApiMediaUrl(url) ?? (isSafeImageUrl(url) ? url : null);
}

/** Safety-filters derivatives for Products built outside the API mapper (drafts, tests, cache). */
function safeSources(urls: Record<number, string> | undefined): Record<number, string> {
  const safe: Record<number, string> = {};
  for (const [width, url] of Object.entries(urls ?? {})) {
    const resolved = resolveImageUrl(url);
    if (resolved) {
      safe[Number(width)] = resolved;
    }
  }
  return safe;
}

/**
 * Shape the derivatives for expo-image's source array. Heights follow from the
 * original's aspect ratio; without its dimensions return none. The original is
 * not a candidate (see pickThumbnailUrl).
 */
function toSourceSet(
  sources: Record<number, string>,
  originalWidth: number | undefined,
  originalHeight: number | undefined,
): ImageSource[] {
  if (!originalWidth || !originalHeight) {
    return [];
  }
  return Object.entries(sources)
    .map(([width, uri]) => ({
      uri,
      width: Number(width),
      height: Math.round((Number(width) * originalHeight) / originalWidth),
    }))
    .filter((source) => source.height > 0)
    .sort((a, b) => a.width - b.width);
}

/**
 * Accessible label: the uploader's description (WCAG 1.1.1), else the
 * product/component name plus a 1-based position when there is more than one image.
 */
export function galleryItemAltText(
  item: GalleryItem,
  index: number,
  total: number,
  fallbackName: string,
): string {
  const description = item.image.description.trim();
  if (description) return description;
  const name = fallbackName.trim() || 'Product image';
  return total > 1 ? `${name} ${index + 1}` : name;
}

export function buildGalleryMedia(product: Product) {
  const images = product.images ?? [];
  const items: GalleryItem[] = images.map((image, index) => {
    const imageUrl = resolveImageUrl(image.url);
    const sources = safeSources(image.thumbnailUrls);
    // useProductGalleryMedia narrows both size tiers once the screen size is known.
    return {
      key: image.id ?? (image.url || `missing-${index}`),
      image,
      thumbnailUrl: resolveImageUrl(image.thumbnailUrl) ?? imageUrl,
      mediumUrl: imageUrl,
      largeUrl: imageUrl,
      originalUrl: imageUrl,
      sources,
      sourceSet: toSourceSet(sources, image.width, image.height),
    };
  });

  return { images, items };
}
