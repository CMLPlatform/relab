import { type GestureResponderEvent, Platform, FlatList as RNFlatList } from 'react-native';
import { FlatList as GHFlatList } from 'react-native-gesture-handler';
import { getResizedImageUrl, resolveApiMediaUrl } from '@/services/api/media';
import type { Product } from '@/types/Product';

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

export function getTouchPointX(event: GestureResponderEvent, type: 'start' | 'end'): number | null {
  const touch =
    type === 'start'
      ? (event.nativeEvent.touches[0] ?? event.nativeEvent.changedTouches[0])
      : event.nativeEvent.changedTouches[0];

  return touch?.pageX ?? null;
}

export function buildGalleryMedia(product: Product) {
  const images = product.images ?? [];
  const media = images.flatMap((image) => {
    const imageUrl = resolveApiMediaUrl(image.url);
    if (!imageUrl) {
      return [];
    }
    const thumbnailUrl = resolveApiMediaUrl(image.thumbnailUrl) ?? imageUrl;
    return [
      {
        image,
        thumbnailUrl,
        mediumUrl: getResizedImageUrl(image.url, image.id, 800) ?? imageUrl,
        largeUrl: getResizedImageUrl(image.url, image.id, 1600) ?? imageUrl,
      },
    ];
  });

  return {
    images: media.map(({ image }) => image),
    thumbnailUrls: media.map(({ thumbnailUrl }) => thumbnailUrl),
    mediumUrls: media.map(({ mediumUrl }) => mediumUrl),
    largeUrls: media.map(({ largeUrl }) => largeUrl),
  };
}
