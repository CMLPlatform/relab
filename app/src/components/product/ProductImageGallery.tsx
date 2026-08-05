import { useCallback, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { ProductImageCameraDialogs } from '@/components/product/gallery/ProductImageCameraDialogs';
import { ProductImageEmptyEditState } from '@/components/product/gallery/ProductImageEmptyEditState';
import { ProductImageGalleryContent } from '@/components/product/gallery/ProductImageGalleryContent';
import { ProductImageLightbox } from '@/components/product/gallery/ProductImageLightbox';
import { ProductImagePlaceholder } from '@/components/product/gallery/ProductImagePlaceholder';
import { ProductImageThumbnails } from '@/components/product/gallery/ProductImageThumbnails';
import { useProductImageGallery } from '@/features/products/useProductImageGallery';
import type { Product } from '@/types/Product';

interface Props {
  product: Product;
  editMode: boolean;
  onImagesChange?: (images: { url: string; description: string; id?: string }[]) => void;
}

export default function ProductImageGallery({ product, editMode, onImagesChange }: Props) {
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
  // Only one of ProductImageGalleryContent's / ProductImageEmptyEditState's RPi
  // buttons renders at a time, so one shared ref covers both — see AppDialog's
  // `triggerRef`.
  const rpiTriggerRef = useRef<View>(null);

  if (media.imageCount === 0 && !editMode) {
    return <ProductImagePlaceholder width={media.width} label={product.name} />;
  }

  return (
    <View style={styles.container}>
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
      ) : editMode ? (
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

      <ProductImageLightbox
        visible={viewer.lightboxOpen}
        items={media.items}
        startIndex={viewer.selectedIndex}
        onIndexChange={actions.selectIndex}
        onClose={actions.closeLightbox}
        fallbackLabel={product.name}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: 16 },
});
