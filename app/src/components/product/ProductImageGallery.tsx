import { lazy, Suspense, useCallback, useRef } from 'react';
import { View } from 'react-native';
import { ProductImageCameraDialogs } from '@/components/product/gallery/ProductImageCameraDialogs';
import { ProductImageEmptyEditState } from '@/components/product/gallery/ProductImageEmptyEditState';
import { ProductImageGalleryContent } from '@/components/product/gallery/ProductImageGalleryContent';
import { ProductImagePlaceholder } from '@/components/product/gallery/ProductImagePlaceholder';
import { ProductImageThumbnails } from '@/components/product/gallery/ProductImageThumbnails';
import { useProductImageGallery } from '@/features/products/useProductImageGallery';
import type { Product } from '@/types/Product';

// NOTE: lazy so the zoom/gesture code loads with the gallery, not on every route's first load.
const ProductImageLightbox = lazy(() =>
  import('@/components/product/gallery/ProductImageLightbox').then((m) => ({
    default: m.ProductImageLightbox,
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
  const { media, viewer, capture, actions } = useProductImageGallery({
    product,
    editMode,
    onImagesChange,
  });
  const handleTakePhoto = async () => actions.takePhoto();
  const handlePickImage = async () => actions.pickImage();
  const handleDeleteImage = useCallback(
    () => actions.deleteImage(viewer.selectedIndex),
    [actions, viewer.selectedIndex],
  );
  // Only one RPi button renders at a time, so one ref covers both (AppDialog's `triggerRef`).
  const rpiTriggerRef = useRef<View>(null);

  if (media.imageCount === 0 && !(editMode && canEdit)) {
    return <ProductImagePlaceholder width={media.width} />;
  }

  return (
    <View className="mb-4">
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

      <ProductImageThumbnails
        imageCount={media.imageCount}
        items={media.items}
        selectedIndex={viewer.selectedIndex}
        thumbsRef={media.thumbsRef}
        onSelectIndex={actions.selectIndex}
        onScrollToIndex={actions.scrollToIndex}
        fallbackLabel={product.name}
      />

      <Suspense fallback={null}>
        <ProductImageLightbox
          visible={viewer.lightboxOpen}
          items={media.items}
          startIndex={viewer.selectedIndex}
          onIndexChange={actions.selectIndex}
          onClose={actions.closeLightbox}
          fallbackLabel={product.name}
        />
      </Suspense>
    </View>
  );
}
