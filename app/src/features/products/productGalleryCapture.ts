import {
  launchCameraAsync,
  launchImageLibraryAsync,
  requestCameraPermissionsAsync,
} from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { clampIndex } from '@/components/product/gallery/shared';
import { useCamerasQuery } from '@/features/cameras/rpi/hooks';
import { useRpiIntegration } from '@/features/cameras/rpi/useRpiIntegration';
import { useAppFeedback } from '@/hooks/useAppFeedback';
import type { CameraReadWithStatus } from '@/services/api/rpiCamera';
import type { useProductGalleryMedia, useProductGalleryViewer } from './productGalleryViewer';
import { buildImportedImages, hasRpiCamerasConfigured } from './productImageGalleryHelpers';

export function useProductGalleryCaptureState({
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

export function useProductGalleryCaptureActions({
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
        message: 'Save this product before you capture from an RPi camera.',
        buttons: [{ text: 'OK' }],
      });
      return;
    }
    if (captureState.rpiCamerasLoading) return;
    if (!captureState.hasCamerasConfigured) {
      captureState.router.navigate('/cameras');
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

export function useProductGalleryImageActions({
  media,
  viewerState,
  onImagesChange,
}: {
  media: ReturnType<typeof useProductGalleryMedia>;
  viewerState: ReturnType<typeof useProductGalleryViewer>;
  onImagesChange?: (images: { url: string; description: string; id?: string }[]) => void;
}) {
  const feedback = useAppFeedback();

  const handlePickImage = useCallback(async () => {
    const result = await launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      quality: 0.8,
    });

    if (!result.canceled) {
      const newImages = await buildImportedImages(result.assets, feedback.error);
      if (newImages.length > 0) onImagesChange?.([...media.images, ...newImages]);
    }
  }, [feedback.error, media.images, onImagesChange]);

  const handleTakePhoto = useCallback(async () => {
    if (Platform.OS !== 'web') {
      const permission = await requestCameraPermissionsAsync();
      if (permission.status !== 'granted') return;
    }
    const result = await launchCameraAsync({ quality: 0.8 });
    if (!result.canceled) {
      const [newImage] = await buildImportedImages([result.assets[0]], feedback.error);
      if (newImage) onImagesChange?.([...media.images, newImage]);
    }
  }, [feedback.error, media.images, onImagesChange]);

  // Undo, not confirm: removal is draft-local until save. Read through a ref,
  // not the closed-over array: a photo imported during the undo window would
  // otherwise be dropped by the restore.
  const imagesRef = useRef(media.images);
  useEffect(() => {
    imagesRef.current = media.images;
  }, [media.images]);

  const handleDeleteImage = useCallback(
    (index: number) => {
      const removed = media.images[index];
      if (!removed) return;
      const newImages = [...media.images];
      newImages.splice(index, 1);
      onImagesChange?.(newImages);
      void viewerState.updateCurrentIndex(clampIndex(index, newImages.length));
      feedback.toast('Photo removed', {
        label: 'Undo',
        onPress: () => {
          // Filter by identity first so an undo racing a re-render does not duplicate.
          const restored = imagesRef.current.filter((image) => image !== removed);
          restored.splice(index, 0, removed);
          onImagesChange?.(restored);
          void viewerState.updateCurrentIndex(index);
        },
      });
    },
    [feedback, media.images, onImagesChange, viewerState],
  );

  return {
    handlePickImage,
    handleTakePhoto,
    handleDeleteImage,
  };
}
