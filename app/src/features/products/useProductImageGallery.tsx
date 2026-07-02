import { useCallback, useMemo } from 'react';
import { useCaptureImageMutation } from '@/features/cameras/rpi/hooks';
import type { Product } from '@/types/Product';
import {
  useProductGalleryCaptureActions,
  useProductGalleryCaptureState,
  useProductGalleryImageActions,
} from './productGalleryCapture';
import {
  useProductGalleryKeyboardShortcuts,
  useProductGalleryMedia,
  useProductGalleryViewer,
  useProductGalleryViewerActions,
} from './productGalleryViewer';
import { appendCapturedImage } from './productImageGalleryHelpers';

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
