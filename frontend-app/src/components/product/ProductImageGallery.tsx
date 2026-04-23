// spell-checker: ignore Zoomable

import { View } from 'react-native';
import { ProductImageCameraDialogs } from '@/components/product/gallery/ProductImageCameraDialogs';
import { ProductImageEmptyEditState } from '@/components/product/gallery/ProductImageEmptyEditState';
import { ProductImageGalleryContent } from '@/components/product/gallery/ProductImageGalleryContent';
import { ProductImageLightbox } from '@/components/product/gallery/ProductImageLightbox';
import { ProductImagePlaceholder } from '@/components/product/gallery/ProductImagePlaceholder';
import { ProductImageThumbnails } from '@/components/product/gallery/ProductImageThumbnails';
import { useProductImageGallery } from '@/hooks/products/useProductImageGallery';
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

  if (media.imageCount === 0 && !editMode) {
    return <ProductImagePlaceholder width={media.width} label={product.name} />;
  }

  return (
    <View style={{ marginBottom: 16 }}>
      {media.imageCount > 0 ? (
        <ProductImageGalleryContent
          width={media.width}
          imageCount={media.imageCount}
          selectedIndex={viewer.selectedIndex}
          mediumUrls={media.mediumUrls}
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
          onDeleteImage={() => actions.deleteImage(viewer.selectedIndex)}
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
      />

      <ProductImageThumbnails
        imageCount={media.imageCount}
        thumbnailUrls={media.thumbnailUrls}
        selectedIndex={viewer.selectedIndex}
        thumbsRef={media.thumbsRef}
        onSelectIndex={actions.selectIndex}
        onScrollToIndex={actions.scrollToIndex}
      />

      <ProductImageLightbox
        visible={viewer.lightboxOpen}
        images={media.largeUrls}
        startIndex={viewer.selectedIndex}
        onIndexChange={actions.selectIndex}
        onClose={actions.closeLightbox}
      />
    </View>
  );
}
