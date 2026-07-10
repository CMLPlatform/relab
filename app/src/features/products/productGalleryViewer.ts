import { Image } from 'expo-image';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Dimensions } from 'react-native';
import { buildGalleryMedia, type ScrollableListHandle } from '@/components/product/gallery/shared';
import { useGalleryIndexPersistence } from '@/features/gallery/useGalleryIndexPersistence';
import { useGalleryKeyboardNavigation } from '@/features/gallery/useGalleryKeyboardNavigation';
import type { CameraReadWithStatus } from '@/services/api/rpiCamera';
import type { Product } from '@/types/Product';

export function useProductGalleryMedia(product: Product) {
  const { images, items } = useMemo(() => buildGalleryMedia(product), [product]);
  const imageCount = items.length;
  const { width } = Dimensions.get('window');
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
      const clamped = Math.max(0, Math.min(index, imageCount - 1));
      try {
        galleryRef.current?.scrollToIndex({ index: clamped, animated: true });
      } catch {
        galleryRef.current?.scrollToOffset({ offset: clamped * width, animated: true });
      }
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
      const clampedIndex = imageCount > 0 ? Math.max(0, Math.min(index, imageCount - 1)) : 0;
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
  updateCurrentIndex,
  scrollToIndex,
}: {
  isWeb: boolean;
  lightboxOpen: boolean;
  imageCount: number;
  selectedIndex: number;
  updateCurrentIndex: (index: number) => Promise<void>;
  scrollToIndex: (index: number) => void;
}) {
  useGalleryKeyboardNavigation({
    enabled: isWeb && !lightboxOpen,
    imageCount,
    selectedIndex,
    onPrevious: () => {
      const next = Math.max(0, selectedIndex - 1);
      void updateCurrentIndex(next);
      scrollToIndex(next);
    },
    onNext: () => {
      const next = Math.min(imageCount - 1, selectedIndex + 1);
      void updateCurrentIndex(next);
      scrollToIndex(next);
    },
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
    const next = Math.max(0, viewerState.selectedIndex - 1);
    void viewerState.updateCurrentIndex(next);
    viewerState.scrollToIndex(next);
  }, [viewerState]);
  const showNextImage = useCallback(() => {
    const next = Math.min(media.imageCount - 1, viewerState.selectedIndex + 1);
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
