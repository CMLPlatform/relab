import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
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

export function useProductImageGallery({
  product,
  editMode,
  onImagesChange,
}: {
  product: Product;
  editMode: boolean;
  onImagesChange?: (images: { url: string; description: string; id?: string }[]) => void;
}) {
  const { width } = Dimensions.get('window');
  const router = useRouter();
  const feedback = useAppFeedback();
  const { images, thumbnailUrls, mediumUrls, largeUrls } = useMemo(
    () => buildGalleryMedia(product),
    [product],
  );
  const imageCount = images.length;
  const isWeb = Platform.OS === 'web';
  const showCameraOption =
    Platform.OS !== 'web' ||
    (typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches);

  const productId = typeof product.id === 'number' ? product.id : null;
  const { enabled: rpiEnabled } = useRpiIntegration();
  const { data: rpiCameras, isLoading: rpiCamerasLoading } = useCamerasQuery(true, {
    enabled: rpiEnabled && editMode,
  });
  const captureMutation = useCaptureImageMutation();
  const [previewCamera, setPreviewCamera] = useState<CameraReadWithStatus | null>(null);
  const [cameraPickerVisible, setCameraPickerVisible] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const showRpiButton = rpiEnabled;
  const hasCamerasConfigured = hasRpiCamerasConfigured(rpiCameras?.length);
  const isNewProduct = productId === null;

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

  const captureFromCamera = useCallback(
    (camera: CameraReadWithStatus) => {
      if (!productId) return;
      setPreviewCamera(null);
      setCameraPickerVisible(false);
      setIsCapturing(true);
      captureMutation.mutate(
        { cameraId: camera.id, productId },
        {
          onSuccess: (captured) => {
            onImagesChange?.(appendCapturedImage(images, captured));
          },
          onError: (error) =>
            feedback.alert({
              title: 'Capture failed',
              message: String(error),
              buttons: [{ text: 'OK' }],
            }),
          onSettled: () => setIsCapturing(false),
        },
      );
    },
    [captureMutation, feedback, images, onImagesChange, productId],
  );

  const handleRpiCapture = useCallback(() => {
    if (isNewProduct) {
      feedback.alert({
        title: 'Save required',
        message: 'Save this product first before capturing from an RPi camera.',
        buttons: [{ text: 'OK' }],
      });
      return;
    }
    if (rpiCamerasLoading) return;
    if (!hasCamerasConfigured) {
      router.push('/cameras');
      return;
    }
    setCameraPickerVisible(true);
  }, [feedback, hasCamerasConfigured, isNewProduct, rpiCamerasLoading, router]);

  const handlePickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      quality: 0.8,
    });

    if (!result.canceled) {
      const newImages = await buildImportedImages(result.assets);
      onImagesChange?.([...images, ...newImages]);
    }
  };

  const handleTakePhoto = async () => {
    if (Platform.OS !== 'web') {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (permission.status !== 'granted') return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.8 });
    if (!result.canceled) {
      const [newImage] = await buildImportedImages([result.assets[0]]);
      onImagesChange?.([...images, newImage]);
    }
  };

  const handleDeleteImage = (index: number) => {
    const newImages = [...images];
    newImages.splice(index, 1);
    onImagesChange?.(newImages);
    void updateCurrentIndex(Math.max(0, Math.min(index, newImages.length - 1)));
  };

  return {
    media: {
      width,
      imageCount,
      images,
      thumbnailUrls,
      mediumUrls,
      largeUrls,
      galleryRef,
      thumbsRef,
    },
    viewer: {
      selectedIndex,
      lightboxOpen,
      cameraPickerVisible,
      previewCamera,
    },
    capture: {
      showCameraOption,
      showRpiButton,
      hasCamerasConfigured,
      rpiCamerasLoading,
      isCapturing,
    },
    actions: {
      selectIndex: updateCurrentIndex,
      openLightbox: (index: number) => {
        void updateCurrentIndex(index);
        setLightboxOpen(true);
      },
      closeLightbox: () => setLightboxOpen(false),
      showPreviousImage: () => {
        const next = Math.max(0, selectedIndex - 1);
        void updateCurrentIndex(next);
        scrollToIndex(next);
      },
      showNextImage: () => {
        const next = Math.min(imageCount - 1, selectedIndex + 1);
        void updateCurrentIndex(next);
        scrollToIndex(next);
      },
      syncIndexFromScroll: (event: { nativeEvent: { contentOffset: { x: number } } }) => {
        const index = Math.round(event.nativeEvent.contentOffset.x / width);
        void updateCurrentIndex(index);
      },
      requestRpiCapture: handleRpiCapture,
      pickImage: handlePickImage,
      takePhoto: handleTakePhoto,
      deleteImage: handleDeleteImage,
      dismissCameraPicker: () => setCameraPickerVisible(false),
      selectPreviewCamera: (camera: CameraReadWithStatus) => {
        setCameraPickerVisible(false);
        setPreviewCamera(camera);
      },
      dismissPreview: () => setPreviewCamera(null),
      capturePreview: () => {
        if (previewCamera) captureFromCamera(previewCamera);
      },
      scrollToIndex,
    },
  };
}
