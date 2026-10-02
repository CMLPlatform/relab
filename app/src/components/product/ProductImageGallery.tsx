import { useCallback, useRef, useState } from 'react';
import { type LayoutChangeEvent, View } from 'react-native';
import { LazyBoundary } from '@/components/base/LazyBoundary';
import { lazyWithRetry } from '@/components/base/lazyWithRetry';
import { loadLightbox } from '@/components/product/gallery/lightboxChunk';
import { ProductImageEmptyEditState } from '@/components/product/gallery/ProductImageEmptyEditState';
import { ProductImageGalleryContent } from '@/components/product/gallery/ProductImageGalleryContent';
import { ProductImagePlaceholder } from '@/components/product/gallery/ProductImagePlaceholder';
import { ProductImageThumbnails } from '@/components/product/gallery/ProductImageThumbnails';
import { useProductImageGallery } from '@/features/products/useProductImageGallery';
import { useOpenedOnce } from '@/hooks/useOpenedOnce';
import type { Product } from '@/types/Product';

// NOTE: the lightbox (gestures, zoom) and the Pi preview (video player) are heavy and
// opened rarely, so each loads on first open instead of with every product page.
const ProductImageLightbox = lazyWithRetry(loadLightbox);
const ProductImageCameraDialogs = lazyWithRetry(() =>
  import('@/components/product/gallery/ProductImageCameraDialogs').then((m) => ({
    default: m.ProductImageCameraDialogs,
  })),
);

interface Props {
  product: Product;
  editMode: boolean;
  /** False while moderating someone else's record: images can be deleted but not added. */
  canEdit?: boolean;
  onImagesChange?: (images: { url: string; description: string; id?: string }[]) => void;
}

export default function ProductImageGallery({
  product,
  editMode,
  canEdit = true,
  onImagesChange,
}: Props) {
  // Pages match the strip, narrower than the window once inset into the column.
  const [layoutWidth, setLayoutWidth] = useState<number>();
  const onLayout = useCallback(
    (event: LayoutChangeEvent) => setLayoutWidth(event.nativeEvent.layout.width),
    [],
  );
  const { media, viewer, capture, actions } = useProductImageGallery({
    product,
    editMode,
    onImagesChange,
    layoutWidth,
  });
  const handleTakePhoto = async () => actions.takePhoto();
  const handlePickImage = async () => actions.pickImage();
  const handleDeleteImage = useCallback(
    () => actions.deleteImage(viewer.selectedIndex),
    [actions, viewer.selectedIndex],
  );
  // Only one RPi button renders at a time, so one ref covers both (AppDialog's `triggerRef`).
  const rpiTriggerRef = useRef<View>(null);
  const cameraDialogsOpen = viewer.cameraPickerVisible || viewer.previewCamera !== null;
  const showCameraDialogs = useOpenedOnce(cameraDialogsOpen);
  const showLightbox = useOpenedOnce(viewer.lightboxOpen);
  const closeCameraDialogs = useCallback(() => {
    actions.dismissCameraPicker();
    actions.dismissPreview();
  }, [actions]);

  if (media.imageCount === 0 && !(editMode && canEdit)) {
    return (
      <View onLayout={onLayout}>
        <ProductImagePlaceholder width={media.width} />
      </View>
    );
  }

  return (
    <View className="mb-4" onLayout={onLayout}>
      {media.imageCount > 0 ? (
        <ProductImageGalleryContent
          width={media.width}
          imageCount={media.imageCount}
          selectedIndex={viewer.selectedIndex}
          items={media.items}
          galleryRef={media.galleryRef}
          onSelectIndex={actions.selectIndex}
          onOpenLightbox={actions.openLightbox}
          onPrev={actions.showPreviousImage}
          onNext={actions.showNextImage}
          onScrollEnd={actions.syncIndexFromScroll}
          editMode={editMode}
          canEdit={canEdit}
          showCameraOption={capture.showCameraOption}
          showRpiButton={capture.showRpiButton}
          hasCamerasConfigured={capture.hasCamerasConfigured}
          isCapturing={capture.isCapturing}
          rpiCamerasLoading={capture.rpiCamerasLoading}
          onTakePhoto={handleTakePhoto}
          onPickImage={handlePickImage}
          onRpiCapture={actions.requestRpiCapture}
          onDeleteImage={handleDeleteImage}
          fallbackLabel={product.name}
          rpiTriggerRef={rpiTriggerRef}
        />
      ) : editMode && canEdit ? (
        <ProductImageEmptyEditState
          showCameraOption={capture.showCameraOption}
          showRpiButton={capture.showRpiButton}
          hasCamerasConfigured={capture.hasCamerasConfigured}
          isCapturing={capture.isCapturing}
          rpiCamerasLoading={capture.rpiCamerasLoading}
          onTakePhoto={handleTakePhoto}
          onPickImage={handlePickImage}
          onRpiCapture={actions.requestRpiCapture}
          rpiTriggerRef={rpiTriggerRef}
        />
      ) : null}

      {showCameraDialogs ? (
        <LazyBoundary open={cameraDialogsOpen} onError={closeCameraDialogs}>
          <ProductImageCameraDialogs
            cameraPickerVisible={viewer.cameraPickerVisible}
            onDismissCameraPicker={actions.dismissCameraPicker}
            onSelectCamera={actions.selectPreviewCamera}
            previewCamera={viewer.previewCamera}
            onDismissPreview={actions.dismissPreview}
            isCapturing={capture.isCapturing}
            onCapturePreview={actions.capturePreview}
            triggerRef={rpiTriggerRef}
          />
        </LazyBoundary>
      ) : null}

      <ProductImageThumbnails
        imageCount={media.imageCount}
        items={media.items}
        selectedIndex={viewer.selectedIndex}
        thumbsRef={media.thumbsRef}
        onSelectIndex={actions.selectIndex}
        onScrollToIndex={actions.scrollToIndex}
        fallbackLabel={product.name}
      />

      {showLightbox ? (
        <LazyBoundary open={viewer.lightboxOpen} onError={actions.closeLightbox}>
          <ProductImageLightbox
            visible={viewer.lightboxOpen}
            items={media.items}
            startIndex={viewer.selectedIndex}
            onIndexChange={actions.selectIndex}
            onClose={actions.closeLightbox}
            fallbackLabel={product.name}
          />
        </LazyBoundary>
      ) : null}
    </View>
  );
}
