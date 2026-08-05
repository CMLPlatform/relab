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
 * One gallery slide. Exactly one item per product image, in source order — the
 * viewer's index is therefore also the index into `product.images`, which is
 * what the add/delete actions write back.
 *
 * A URL is `null` when it cannot be resolved (the stored file is missing, so the
 * API returns an empty url) or when it is not a safe image URL. Those items still
 * occupy their slot and render a placeholder; dropping them would shift every
 * later index and silently delete the image on the next save.
 */
export type GalleryItem = {
  key: string;
  image: ProductImage;
  thumbnailUrl: string | null;
  mediumUrl: string | null;
  largeUrl: string | null;
};

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

/**
 * Scrolls a paged horizontal list to `index`. `scrollToIndex` fails on some
 * platforms/list implementations when the target hasn't been measured yet
 * (e.g. it hasn't rendered), so this falls back to an offset-based scroll
 * computed from the fixed item `width`.
 */
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

/**
 * Accessible label for a gallery item: the uploader's own description when
 * there is one (WCAG 1.1.1 — meaningful alt text, not "image 3"). Otherwise
 * falls back to the product/component name, plus a 1-based position when
 * there is more than one image, since two undescribed images sharing the
 * same fallback name would otherwise be indistinguishable to a screen reader.
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
    return {
      key: image.id ?? (image.url || `missing-${index}`),
      image,
      thumbnailUrl: resolveImageUrl(image.thumbnailUrl) ?? imageUrl,
      mediumUrl: imageUrl,
      largeUrl: imageUrl,
    };
  });

  return { images, items };
}
