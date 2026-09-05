import { Image } from 'expo-image';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PixelRatio, useWindowDimensions } from 'react-native';
import {
  buildGalleryMedia,
  clampIndex,
  type ScrollableListHandle,
  scrollListToIndex,
} from '@/components/product/gallery/shared';
import { useGalleryIndexPersistence } from '@/features/gallery/useGalleryIndexPersistence';
import { useGalleryKeyboardNavigation } from '@/features/gallery/useGalleryKeyboardNavigation';
import { pickThumbnailUrl } from '@/services/api/media';
import type { CameraReadWithStatus } from '@/services/api/rpiCamera';
import type { Product } from '@/types/Product';

export function useProductGalleryMedia(product: Product) {
  const { images, items: rawItems } = useMemo(() => buildGalleryMedia(product), [product]);
  // Reactive, unlike Dimensions.get: this width drives the pager's getItemLayout
  // and each slide's style as well as the size pick below, so a non-subscribing
  // read left all three stale after a rotation.
  const { width, height } = useWindowDimensions();
  // React Native has no srcset, so each tier is resolved once here, where the
  // screen size is known, and every consumer downstream (the pager, the
  // lightbox, the prefetch below) keeps reading the same two fields.
  //
  // Without this both tiers stay pointed at the full-resolution upload: opening
  // a gallery pulled several megabytes per image to fill a ~390pt-wide view,
  // and the prefetch did it for every image in the product at once.
  const items = useMemo(() => {
    const scale = PixelRatio.get();
    const mediumPx = width * scale;
    // The lightbox is full-bleed and pinch-zoomable, so it asks for the larger
    // screen dimension. Zooming past what this holds swaps in the original.
    const largePx = Math.max(width, height) * scale;
    return rawItems.map((item) => ({
      ...item,
      mediumUrl: pickThumbnailUrl(item.sources, mediumPx) ?? item.mediumUrl,
      largeUrl: pickThumbnailUrl(item.sources, largePx) ?? item.largeUrl,
    }));
  }, [rawItems, width, height]);
  const imageCount = items.length;
  const prefetchUrls = useMemo(
    () => items.map((item) => item.mediumUrl).filter((url): url is string => url !== null),
    [items],
  );

  return {
    width,
    images,
    items,
    prefetchUrls,
    imageCount,
  };
}

export function useProductGalleryViewer({
  width,
  imageCount,
  prefetchUrls,
  productId,
}: {
  width: number;
  imageCount: number;
  prefetchUrls: string[];
  productId: number | null;
}) {
  const galleryRef = useRef<ScrollableListHandle | null>(null);
  const thumbsRef = useRef<ScrollableListHandle | null>(null);
  const previousLightboxOpenRef = useRef(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const scrollToIndex = useCallback(
    (index: number) => {
      scrollListToIndex(galleryRef.current, clampIndex(index, imageCount), width, true);
    },
    [imageCount, width],
  );

  // Plain callback: useGalleryIndexPersistence wraps it in an effect event, so a
  // stale closure is not a concern here.
  const restoreIndex = useCallback(
    (index: number) => {
      setSelectedIndex(index);
      scrollToIndex(index);
    },
    [scrollToIndex],
  );
  const { persistIndex } = useGalleryIndexPersistence({
    productId,
    imageCount,
    onRestore: restoreIndex,
  });

  const updateCurrentIndex = useCallback(
    async (index: number) => {
      const clampedIndex = imageCount > 0 ? clampIndex(index, imageCount) : 0;
      setSelectedIndex(clampedIndex);
      await persistIndex(clampedIndex);
    },
    [imageCount, persistIndex],
  );

  useEffect(() => {
    if (previousLightboxOpenRef.current && !lightboxOpen && imageCount > 0) {
      scrollToIndex(selectedIndex);
    }
    previousLightboxOpenRef.current = lightboxOpen;
  }, [imageCount, lightboxOpen, scrollToIndex, selectedIndex]);

  useEffect(() => {
    for (const url of prefetchUrls) {
      Image.prefetch(url);
    }
  }, [prefetchUrls]);

  return {
    galleryRef,
    thumbsRef,
    selectedIndex,
    lightboxOpen,
    setLightboxOpen,
    persistIndex,
    setSelectedIndex,
    scrollToIndex,
    updateCurrentIndex,
  };
}

export function useProductGalleryKeyboardShortcuts({
  isWeb,
  lightboxOpen,
  imageCount,
  selectedIndex,
  onPrevious,
  onNext,
}: {
  isWeb: boolean;
  lightboxOpen: boolean;
  imageCount: number;
  selectedIndex: number;
  onPrevious: () => void;
  onNext: () => void;
}) {
  useGalleryKeyboardNavigation({
    enabled: isWeb && !lightboxOpen,
    imageCount,
    selectedIndex,
    onPrevious,
    onNext,
  });
}

export function useProductGalleryViewerActions({
  media,
  viewerState,
  captureFromCamera,
  previewCamera,
}: {
  media: ReturnType<typeof useProductGalleryMedia>;
  viewerState: ReturnType<typeof useProductGalleryViewer>;
  captureFromCamera: (camera: CameraReadWithStatus) => void;
  previewCamera: CameraReadWithStatus | null;
}) {
  const openLightbox = useCallback(
    (index: number) => {
      void viewerState.updateCurrentIndex(index);
      viewerState.setLightboxOpen(true);
    },
    [viewerState],
  );
  const closeLightbox = useCallback(() => {
    viewerState.setLightboxOpen(false);
  }, [viewerState]);
  const showPreviousImage = useCallback(() => {
    const next = clampIndex(viewerState.selectedIndex - 1, media.imageCount);
    void viewerState.updateCurrentIndex(next);
    viewerState.scrollToIndex(next);
  }, [media.imageCount, viewerState]);
  const showNextImage = useCallback(() => {
    const next = clampIndex(viewerState.selectedIndex + 1, media.imageCount);
    void viewerState.updateCurrentIndex(next);
    viewerState.scrollToIndex(next);
  }, [media.imageCount, viewerState]);
  const syncIndexFromScroll = useCallback(
    (event: { nativeEvent: { contentOffset: { x: number } } }) => {
      const index = Math.round(event.nativeEvent.contentOffset.x / media.width);
      void viewerState.updateCurrentIndex(index);
    },
    [media.width, viewerState],
  );
  const capturePreview = useCallback(() => {
    if (previewCamera) {
      captureFromCamera(previewCamera);
    }
  }, [captureFromCamera, previewCamera]);

  return {
    openLightbox,
    closeLightbox,
    showPreviousImage,
    showNextImage,
    syncIndexFromScroll,
    capturePreview,
  };
}
