// spell-checker: ignore Zoomable

import { View } from 'react-native';
import {
  ProductImageCameraDialogs,
  ProductImageEmptyEditState,
  ProductImageGalleryContent,
  ProductImagePlaceholder,
  ProductImageThumbnails,
} from '@/components/product/gallery/ProductImageGallerySections';
import { ProductImageLightbox } from '@/components/product/gallery/ProductImageLightbox';
import type { ScrollEvent } from '@/components/product/gallery/shared';
import { useProductImageGallery } from '@/hooks/useProductImageGallery';
import type { Product } from '@/types/Product';

interface Props {
  product: Product;
  editMode: boolean;
  onImagesChange?: (images: { url: string; description: string; id?: string }[]) => void;
}

export default function ProductImageGallery({ product, editMode, onImagesChange }: Props) {
  const {
    width,
    imageCount,
    thumbnailUrls,
    mediumUrls,
    largeUrls,
    showCameraOption,
    showRpiButton,
    hasCamerasConfigured,
    rpiCamerasLoading,
    cameraPickerVisible,
    setCameraPickerVisible,
    previewCamera,
    setPreviewCamera,
    isCapturing,
    selectedIndex,
    lightboxOpen,
    setLightboxOpen,
    galleryRef,
    thumbsRef,
    updateCurrentIndex,
    scrollToIndex,
    captureFromCamera,
    handleRpiCapture,
    handlePickImage,
    handleTakePhoto,
    handleDeleteImage,
  } = useProductImageGallery({
    product,
    editMode,
    onImagesChange,
  });

  if (imageCount === 0 && !editMode) {
    return <ProductImagePlaceholder width={width} label={product.name} />;
  }

  return (
    <View style={{ marginBottom: 16 }}>
      {imageCount > 0 ? (
        <ProductImageGalleryContent
          width={width}
          imageCount={imageCount}
          selectedIndex={selectedIndex}
          mediumUrls={mediumUrls}
          onSelectIndex={(index) => updateCurrentIndex(index)}
          onOpenLightbox={(index) => {
            void updateCurrentIndex(index);
            setLightboxOpen(true);
          }}
          onPrev={() => {
            const next = Math.max(0, selectedIndex - 1);
            void updateCurrentIndex(next);
            scrollToIndex(next);
          }}
          onNext={() => {
            const next = Math.min(imageCount - 1, selectedIndex + 1);
            void updateCurrentIndex(next);
            scrollToIndex(next);
          }}
          galleryRef={galleryRef}
          onScrollEnd={(event: ScrollEvent) => {
            const index = Math.round(event.nativeEvent.contentOffset.x / width);
            void updateCurrentIndex(index);
          }}
          editMode={editMode}
          showCameraOption={showCameraOption}
          showRpiButton={showRpiButton}
          hasCamerasConfigured={hasCamerasConfigured}
          isCapturing={isCapturing}
          rpiCamerasLoading={rpiCamerasLoading}
          onTakePhoto={() => {
            void handleTakePhoto();
          }}
          onPickImage={() => {
            void handlePickImage();
          }}
          onRpiCapture={handleRpiCapture}
          onDeleteImage={() => handleDeleteImage(selectedIndex)}
        />
      ) : editMode ? (
        <ProductImageEmptyEditState
          showCameraOption={showCameraOption}
          showRpiButton={showRpiButton}
          hasCamerasConfigured={hasCamerasConfigured}
          isCapturing={isCapturing}
          rpiCamerasLoading={rpiCamerasLoading}
          onTakePhoto={() => {
            void handleTakePhoto();
          }}
          onPickImage={() => {
            void handlePickImage();
          }}
          onRpiCapture={handleRpiCapture}
        />
      ) : null}

      <ProductImageCameraDialogs
        cameraPickerVisible={cameraPickerVisible}
        onDismissCameraPicker={() => setCameraPickerVisible(false)}
        onSelectCamera={(camera) => {
          setCameraPickerVisible(false);
          setPreviewCamera(camera);
        }}
        previewCamera={previewCamera}
        onDismissPreview={() => setPreviewCamera(null)}
        isCapturing={isCapturing}
        onCapturePreview={() => {
          if (previewCamera) captureFromCamera(previewCamera);
        }}
      />

      <ProductImageThumbnails
        imageCount={imageCount}
        thumbnailUrls={thumbnailUrls}
        selectedIndex={selectedIndex}
        thumbsRef={thumbsRef}
        onSelectIndex={(index) => updateCurrentIndex(index)}
        onScrollToIndex={scrollToIndex}
      />

      <ProductImageLightbox
        visible={lightboxOpen}
        images={largeUrls}
        startIndex={selectedIndex}
        onIndexChange={updateCurrentIndex}
        onClose={() => setLightboxOpen(false)}
      />
    </View>
  );
}
