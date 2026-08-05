import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useCaptureImageMutation } from '@/features/cameras/rpi/hooks';
import { useEffectiveCameraConnection } from '@/features/cameras/useEffectiveCameraConnection';
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
  const captureActions = useProductGalleryCaptureActions({
    productId,
    captureState,
  });
  // Route capture to the previewed camera's direct endpoint when it's only
  // reachable locally (relay offline); otherwise the request falls back to the
  // relay path, which can't reach a direct-only camera.
  const previewConnection = useEffectiveCameraConnection(captureActions.previewCamera);
  const captureMutation = useCaptureImageMutation(previewConnection.localConnection);
  const imageActions = useProductGalleryImageActions({
    media,
    viewerState,
    onImagesChange,
  });
  // The capture round-trip can take seconds; merge against the images as they
  // are when it resolves, not a stale snapshot from when it was started —
  // otherwise deletes/picks made while capturing are clobbered.
  const latestImagesRef = useRef(media.images);
  useEffect(() => {
    latestImagesRef.current = media.images;
  }, [media.images]);
  const runCameraCapture = useCallback(
    (cameraId: string, nextProductId: number) => {
      captureMutation.mutate(
        { cameraId, productId: nextProductId },
        {
          onSuccess: (captured) => {
            onImagesChange?.(appendCapturedImage(latestImagesRef.current, captured));
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
    [captureActions, captureMutation, captureState.feedback, onImagesChange],
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
    prefetchUrls: media.prefetchUrls,
    productId,
  });
  const actions = useProductGalleryActions({
    media,
    captureState,
    viewerState,
    productId,
    onImagesChange,
  });
  useProductGalleryKeyboardShortcuts({
    isWeb: captureState.isWeb,
    lightboxOpen: viewerState.lightboxOpen,
    imageCount: media.imageCount,
    selectedIndex: viewerState.selectedIndex,
    onPrevious: actions.showPreviousImage,
    onNext: actions.showNextImage,
  });

  return useMemo(
    () => ({
      media: {
        width: media.width,
        imageCount: media.imageCount,
        images: media.images,
        items: media.items,
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
      media.items,
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
