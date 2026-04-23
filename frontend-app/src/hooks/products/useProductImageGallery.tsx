import { Image } from 'expo-image';
import {
  launchCameraAsync,
  launchImageLibraryAsync,
  requestCameraPermissionsAsync,
} from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Dimensions, Platform } from 'react-native';
import { buildGalleryMedia, type ScrollableListHandle } from '@/components/product/gallery/shared';
import { useGalleryIndexPersistence } from '@/hooks/gallery/useGalleryIndexPersistence';
import { useGalleryKeyboardNavigation } from '@/hooks/gallery/useGalleryKeyboardNavigation';
import {
  appendCapturedImage,
  buildImportedImages,
  hasRpiCamerasConfigured,
} from '@/hooks/products/productImageGalleryHelpers';
import { useAppFeedback } from '@/hooks/useAppFeedback';
import { useCamerasQuery, useCaptureImageMutation } from '@/hooks/useRpiCameras';
import { useRpiIntegration } from '@/hooks/useRpiIntegration';
import type { CameraReadWithStatus } from '@/services/api/rpiCamera';
import type { Product } from '@/types/Product';

function useProductGalleryMedia(product: Product) {
  const { images, thumbnailUrls, mediumUrls, largeUrls } = useMemo(
    () => buildGalleryMedia(product),
    [product],
  );
  const imageCount = images.length;
  const { width } = Dimensions.get('window');

  return {
    width,
    images,
    thumbnailUrls,
    mediumUrls,
    largeUrls,
    imageCount,
  };
}

function useProductGalleryCaptureState({
  productId,
  editMode,
}: {
  productId: number | null;
  editMode: boolean;
}) {
  const router = useRouter();
  const feedback = useAppFeedback();
  const isWeb = Platform.OS === 'web';
  const showCameraOption =
    Platform.OS !== 'web' ||
    (typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches);
  const { enabled: rpiEnabled } = useRpiIntegration();
  const { data: rpiCameras, isLoading: rpiCamerasLoading } = useCamerasQuery(true, {
    enabled: rpiEnabled && editMode,
  });
  const showRpiButton = rpiEnabled;
  const hasCamerasConfigured = hasRpiCamerasConfigured(rpiCameras?.length);
  const isNewProduct = productId === null;

  return {
    router,
    feedback,
    isWeb,
    showCameraOption,
    rpiCamerasLoading,
    showRpiButton,
    hasCamerasConfigured,
    isNewProduct,
  };
}

function useProductGalleryViewer({
  width,
  imageCount,
  mediumUrls,
  productId,
}: {
  width: number;
  imageCount: number;
  mediumUrls: string[];
  productId: number | null;
}) {
  const galleryRef = useRef<ScrollableListHandle | null>(null);
  const thumbsRef = useRef<ScrollableListHandle | null>(null);
  const previousLightboxOpenRef = useRef(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const { pendingIndex, consumePendingIndex, persistIndex } = useGalleryIndexPersistence({
    productId,
    imageCount,
  });

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

  const updateCurrentIndex = useCallback(
    async (index: number) => {
      const clampedIndex = imageCount > 0 ? Math.max(0, Math.min(index, imageCount - 1)) : 0;
      setSelectedIndex(clampedIndex);
      await persistIndex(clampedIndex);
    },
    [imageCount, persistIndex],
  );

  useEffect(() => {
    if (pendingIndex !== null) {
      scrollToIndex(pendingIndex);
      consumePendingIndex();
    }
  }, [consumePendingIndex, pendingIndex, scrollToIndex]);

  useEffect(() => {
    if (previousLightboxOpenRef.current && !lightboxOpen && imageCount > 0) {
      scrollToIndex(selectedIndex);
    }
    previousLightboxOpenRef.current = lightboxOpen;
  }, [imageCount, lightboxOpen, scrollToIndex, selectedIndex]);

  useEffect(() => {
    for (const url of mediumUrls) {
      Image.prefetch(url);
    }
  }, [mediumUrls]);

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

function useProductGalleryKeyboardShortcuts({
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

function useProductGalleryCaptureActions({
  productId,
  captureState,
}: {
  productId: number | null;
  captureState: ReturnType<typeof useProductGalleryCaptureState>;
}) {
  const [previewCamera, setPreviewCamera] = useState<CameraReadWithStatus | null>(null);
  const [cameraPickerVisible, setCameraPickerVisible] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);

  const handleRpiCapture = useCallback(() => {
    if (captureState.isNewProduct) {
      captureState.feedback.alert({
        title: 'Save required',
        message: 'Save this product first before capturing from an RPi camera.',
        buttons: [{ text: 'OK' }],
      });
      return;
    }
    if (captureState.rpiCamerasLoading) return;
    if (!captureState.hasCamerasConfigured) {
      captureState.router.push('/cameras');
      return;
    }
    setCameraPickerVisible(true);
  }, [captureState]);

  const captureFromCamera = useCallback(
    (camera: CameraReadWithStatus, runCapture: (cameraId: string, productId: number) => void) => {
      if (!productId) return;
      setPreviewCamera(null);
      setCameraPickerVisible(false);
      setIsCapturing(true);
      runCapture(camera.id, productId);
    },
    [productId],
  );

  const dismissCameraPicker = useCallback(() => {
    setCameraPickerVisible(false);
  }, []);
  const selectPreviewCamera = useCallback((camera: CameraReadWithStatus) => {
    setCameraPickerVisible(false);
    setPreviewCamera(camera);
  }, []);
  const dismissPreview = useCallback(() => {
    setPreviewCamera(null);
  }, []);

  return {
    previewCamera,
    cameraPickerVisible,
    isCapturing,
    setIsCapturing,
    handleRpiCapture,
    captureFromCamera,
    dismissCameraPicker,
    selectPreviewCamera,
    dismissPreview,
  };
}

function useProductGalleryImageActions({
  media,
  viewerState,
  onImagesChange,
}: {
  media: ReturnType<typeof useProductGalleryMedia>;
  viewerState: ReturnType<typeof useProductGalleryViewer>;
  onImagesChange?: (images: { url: string; description: string; id?: string }[]) => void;
}) {
  const handlePickImage = useCallback(async () => {
    const result = await launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      quality: 0.8,
    });

    if (!result.canceled) {
      const newImages = await buildImportedImages(result.assets);
      onImagesChange?.([...media.images, ...newImages]);
    }
  }, [media.images, onImagesChange]);

  const handleTakePhoto = useCallback(async () => {
    if (Platform.OS !== 'web') {
      const permission = await requestCameraPermissionsAsync();
      if (permission.status !== 'granted') return;
    }
    const result = await launchCameraAsync({ quality: 0.8 });
    if (!result.canceled) {
      const [newImage] = await buildImportedImages([result.assets[0]]);
      onImagesChange?.([...media.images, newImage]);
    }
  }, [media.images, onImagesChange]);

  const handleDeleteImage = useCallback(
    (index: number) => {
      const newImages = [...media.images];
      newImages.splice(index, 1);
      onImagesChange?.(newImages);
      void viewerState.updateCurrentIndex(Math.max(0, Math.min(index, newImages.length - 1)));
    },
    [media.images, onImagesChange, viewerState],
  );

  return {
    handlePickImage,
    handleTakePhoto,
    handleDeleteImage,
  };
}

function useProductGalleryViewerActions({
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

function useProductGalleryActions({
  media,
  captureState,
  viewerState,
  productId,
  onImagesChange,
}: {
  media: ReturnType<typeof useProductGalleryMedia>;
  captureState: ReturnType<typeof useProductGalleryCaptureState>;
  viewerState: ReturnType<typeof useProductGalleryViewer>;
  productId: number | null;
  onImagesChange?: (images: { url: string; description: string; id?: string }[]) => void;
}) {
  const captureMutation = useCaptureImageMutation();
  const captureActions = useProductGalleryCaptureActions({
    productId,
    captureState,
  });
  const imageActions = useProductGalleryImageActions({
    media,
    viewerState,
    onImagesChange,
  });
  const runCameraCapture = useCallback(
    (cameraId: string, nextProductId: number) => {
      captureMutation.mutate(
        { cameraId, productId: nextProductId },
        {
          onSuccess: (captured) => {
            onImagesChange?.(appendCapturedImage(media.images, captured));
          },
          onError: (error) =>
            captureState.feedback.alert({
              title: 'Capture failed',
              message: String(error),
              buttons: [{ text: 'OK' }],
            }),
          onSettled: () => captureActions.setIsCapturing(false),
        },
      );
    },
    [captureActions, captureMutation, captureState.feedback, media.images, onImagesChange],
  );
  const viewerActions = useProductGalleryViewerActions({
    media,
    viewerState,
    captureFromCamera: (camera) => captureActions.captureFromCamera(camera, runCameraCapture),
    previewCamera: captureActions.previewCamera,
  });

  return {
    ...captureActions,
    ...imageActions,
    ...viewerActions,
  };
}

export function useProductImageGallery({
  product,
  editMode,
  onImagesChange,
}: {
  product: Product;
  editMode: boolean;
  onImagesChange?: (images: { url: string; description: string; id?: string }[]) => void;
}) {
  const media = useProductGalleryMedia(product);
  const productId = typeof product.id === 'number' ? product.id : null;
  const captureState = useProductGalleryCaptureState({ productId, editMode });
  const viewerState = useProductGalleryViewer({
    width: media.width,
    imageCount: media.imageCount,
    mediumUrls: media.mediumUrls,
    productId,
  });
  useProductGalleryKeyboardShortcuts({
    isWeb: captureState.isWeb,
    lightboxOpen: viewerState.lightboxOpen,
    imageCount: media.imageCount,
    selectedIndex: viewerState.selectedIndex,
    updateCurrentIndex: viewerState.updateCurrentIndex,
    scrollToIndex: viewerState.scrollToIndex,
  });
  const actions = useProductGalleryActions({
    media,
    captureState,
    viewerState,
    productId,
    onImagesChange,
  });

  return useMemo(
    () => ({
      media: {
        width: media.width,
        imageCount: media.imageCount,
        images: media.images,
        thumbnailUrls: media.thumbnailUrls,
        mediumUrls: media.mediumUrls,
        largeUrls: media.largeUrls,
        galleryRef: viewerState.galleryRef,
        thumbsRef: viewerState.thumbsRef,
      },
      viewer: {
        selectedIndex: viewerState.selectedIndex,
        lightboxOpen: viewerState.lightboxOpen,
        cameraPickerVisible: actions.cameraPickerVisible,
        previewCamera: actions.previewCamera,
      },
      capture: {
        showCameraOption: captureState.showCameraOption,
        showRpiButton: captureState.showRpiButton,
        hasCamerasConfigured: captureState.hasCamerasConfigured,
        rpiCamerasLoading: captureState.rpiCamerasLoading,
        isCapturing: actions.isCapturing,
      },
      actions: {
        selectIndex: viewerState.updateCurrentIndex,
        openLightbox: actions.openLightbox,
        closeLightbox: actions.closeLightbox,
        showPreviousImage: actions.showPreviousImage,
        showNextImage: actions.showNextImage,
        syncIndexFromScroll: actions.syncIndexFromScroll,
        requestRpiCapture: actions.handleRpiCapture,
        pickImage: actions.handlePickImage,
        takePhoto: actions.handleTakePhoto,
        deleteImage: actions.handleDeleteImage,
        dismissCameraPicker: actions.dismissCameraPicker,
        selectPreviewCamera: actions.selectPreviewCamera,
        dismissPreview: actions.dismissPreview,
        capturePreview: actions.capturePreview,
        scrollToIndex: viewerState.scrollToIndex,
      },
    }),
    [
      actions.cameraPickerVisible,
      actions.capturePreview,
      actions.closeLightbox,
      actions.dismissCameraPicker,
      actions.dismissPreview,
      actions.handleDeleteImage,
      actions.handlePickImage,
      actions.handleRpiCapture,
      actions.handleTakePhoto,
      actions.isCapturing,
      actions.openLightbox,
      actions.previewCamera,
      actions.selectPreviewCamera,
      actions.showNextImage,
      actions.showPreviousImage,
      actions.syncIndexFromScroll,
      captureState.hasCamerasConfigured,
      captureState.rpiCamerasLoading,
      captureState.showCameraOption,
      captureState.showRpiButton,
      media.imageCount,
      media.images,
      media.largeUrls,
      media.mediumUrls,
      media.thumbnailUrls,
      media.width,
      viewerState.galleryRef,
      viewerState.lightboxOpen,
      viewerState.scrollToIndex,
      viewerState.selectedIndex,
      viewerState.thumbsRef,
      viewerState.updateCurrentIndex,
    ],
  );
}
