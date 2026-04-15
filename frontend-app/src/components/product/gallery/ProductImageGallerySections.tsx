import { Image } from 'expo-image';
import { Pressable, Text, View } from 'react-native';
import { ActivityIndicator, Button, Dialog, Icon, Portal } from 'react-native-paper';
import { CameraPickerDialog } from '@/components/cameras/CameraPickerDialog';
import { LivePreview } from '@/components/cameras/LivePreview';
import ImagePlaceholder from '@/components/common/ImagePlaceholder';
import {
  GalleryFlatList,
  IMAGE_HEIGHT,
  type ScrollableListHandle,
  type ScrollEvent,
} from '@/components/product/gallery/shared';
import type { CameraReadWithStatus } from '@/services/api/rpiCamera';

export function ProductImagePlaceholder({ width, label }: { width: number; label: string }) {
  return (
    <View style={{ marginBottom: 16 }}>
      <ImagePlaceholder
        width={width}
        height={IMAGE_HEIGHT}
        label={label}
        testID="image-placeholder"
      />
    </View>
  );
}

type GalleryContentProps = {
  width: number;
  imageCount: number;
  selectedIndex: number;
  mediumUrls: string[];
  onSelectIndex: (index: number) => void;
  onOpenLightbox: (index: number) => void;
  onPrev: () => void;
  onNext: () => void;
  galleryRef: React.RefObject<ScrollableListHandle | null>;
  onScrollEnd: (event: ScrollEvent) => void;
  editMode: boolean;
  showCameraOption: boolean;
  showRpiButton: boolean;
  hasCamerasConfigured: boolean;
  isCapturing: boolean;
  rpiCamerasLoading: boolean;
  onTakePhoto: () => void;
  onPickImage: () => void;
  onRpiCapture: () => void;
  onDeleteImage: () => void;
};

export function ProductImageGalleryContent({
  width,
  imageCount,
  selectedIndex,
  mediumUrls,
  onSelectIndex,
  onOpenLightbox,
  onPrev,
  onNext,
  galleryRef,
  onScrollEnd,
  editMode,
  showCameraOption,
  showRpiButton,
  hasCamerasConfigured,
  isCapturing,
  rpiCamerasLoading,
  onTakePhoto,
  onPickImage,
  onRpiCapture,
  onDeleteImage,
}: GalleryContentProps) {
  return (
    <View style={{ position: 'relative' }}>
      <GalleryFlatList
        ref={(instance: ScrollableListHandle | null) => {
          galleryRef.current = instance;
        }}
        data={mediumUrls}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyExtractor={(_, index: number) => String(index)}
        getItemLayout={(_data, index: number) => ({
          length: width,
          offset: width * index,
          index,
        })}
        renderItem={({ item, index }: { item: string; index: number }) => (
          <Pressable
            onPress={() => {
              void onSelectIndex(index);
              onOpenLightbox(index);
            }}
            accessibilityRole="button"
            accessibilityLabel={`View image ${index + 1}`}
          >
            <Image
              source={{ uri: item }}
              contentFit="cover"
              style={{ width, height: IMAGE_HEIGHT }}
            />
          </Pressable>
        )}
        onMomentumScrollEnd={onScrollEnd}
        onScrollEndDrag={onScrollEnd}
      />

      {imageCount > 1 ? (
        <>
          <Pressable
            onPress={onPrev}
            accessibilityLabel="Previous image"
            disabled={selectedIndex === 0}
            hitSlop={15}
            style={{
              position: 'absolute',
              left: 8,
              top: '50%',
              marginTop: -22,
              width: 44,
              height: 44,
              borderRadius: 22,
              justifyContent: 'center',
              alignItems: 'center',
              backgroundColor: 'rgba(0,0,0,0.35)',
              opacity: selectedIndex === 0 ? 0.3 : 1,
            }}
          >
            <Icon source="chevron-left" size={32} color="white" />
          </Pressable>

          <Pressable
            onPress={onNext}
            accessibilityLabel="Next image"
            disabled={selectedIndex === imageCount - 1}
            hitSlop={15}
            style={{
              position: 'absolute',
              right: 8,
              top: '50%',
              marginTop: -22,
              width: 44,
              height: 44,
              borderRadius: 22,
              justifyContent: 'center',
              alignItems: 'center',
              backgroundColor: 'rgba(0,0,0,0.35)',
              opacity: selectedIndex === imageCount - 1 ? 0.3 : 1,
            }}
          >
            <Icon source="chevron-right" size={32} color="white" />
          </Pressable>
        </>
      ) : null}

      {imageCount > 1 ? (
        <View
          style={{
            position: 'absolute',
            bottom: 12,
            right: 12,
            backgroundColor: 'rgba(0,0,0,0.6)',
            paddingHorizontal: 12,
            paddingVertical: 4,
            borderRadius: 16,
          }}
        >
          <Text style={{ color: 'white', fontSize: 12, fontWeight: 'bold' }}>
            {selectedIndex + 1} / {imageCount}
          </Text>
        </View>
      ) : null}

      {editMode ? (
        <>
          <View style={{ position: 'absolute', top: 12, left: 12, flexDirection: 'row', gap: 8 }}>
            {showCameraOption ? (
              <IconActionButton onPress={onTakePhoto} label="Take photo" icon="camera" />
            ) : null}
            <IconActionButton
              onPress={onPickImage}
              label="Add photo from gallery"
              icon="image-plus"
            />
            {showRpiButton ? (
              <Pressable
                onPress={onRpiCapture}
                disabled={isCapturing || rpiCamerasLoading}
                accessibilityLabel={
                  hasCamerasConfigured ? 'Capture from RPi camera' : 'Set up RPi camera'
                }
                style={{
                  backgroundColor: 'rgba(0,0,0,0.45)',
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  justifyContent: 'center',
                  alignItems: 'center',
                  opacity: isCapturing || rpiCamerasLoading ? 0.5 : 1,
                }}
              >
                {isCapturing || rpiCamerasLoading ? (
                  <ActivityIndicator size={18} color="white" />
                ) : (
                  <Icon source="camera-wireless" size={20} color="white" />
                )}
              </Pressable>
            ) : null}
          </View>

          <Pressable
            onPress={onDeleteImage}
            accessibilityLabel="Delete photo"
            style={{
              position: 'absolute',
              top: 12,
              right: 12,
              backgroundColor: 'rgba(255,50,50,0.8)',
              width: 36,
              height: 36,
              borderRadius: 18,
              justifyContent: 'center',
              alignItems: 'center',
            }}
          >
            <Icon source="delete" size={20} color="white" />
          </Pressable>
        </>
      ) : null}
    </View>
  );
}

export function ProductImageEmptyEditState({
  showCameraOption,
  showRpiButton,
  hasCamerasConfigured,
  isCapturing,
  rpiCamerasLoading,
  onTakePhoto,
  onPickImage,
  onRpiCapture,
}: {
  showCameraOption: boolean;
  showRpiButton: boolean;
  hasCamerasConfigured: boolean;
  isCapturing: boolean;
  rpiCamerasLoading: boolean;
  onTakePhoto: () => void;
  onPickImage: () => void;
  onRpiCapture: () => void;
}) {
  return (
    <View style={{ flexDirection: 'row', gap: 12, height: IMAGE_HEIGHT }}>
      {showCameraOption ? (
        <EmptyActionCard
          onPress={onTakePhoto}
          label="Camera"
          accessibilityLabel="Take photo with camera"
          icon="camera"
        />
      ) : null}

      <EmptyActionCard
        onPress={onPickImage}
        label="Add Photos"
        accessibilityLabel="Add photos from gallery"
        icon="image-plus"
      />

      {showRpiButton ? (
        <Pressable
          onPress={onRpiCapture}
          disabled={isCapturing || rpiCamerasLoading}
          accessibilityRole="button"
          accessibilityLabel={
            hasCamerasConfigured ? 'Capture from RPi camera' : 'Set up RPi camera'
          }
          style={{
            flex: 1,
            backgroundColor: '#eee',
            justifyContent: 'center',
            alignItems: 'center',
            borderRadius: 8,
            borderWidth: 2,
            borderColor: '#ccc',
            borderStyle: 'dashed',
            opacity: isCapturing || rpiCamerasLoading ? 0.5 : 1,
          }}
        >
          {isCapturing || rpiCamerasLoading ? (
            <ActivityIndicator size={32} />
          ) : (
            <Icon source="camera-wireless" size={48} color="#999" />
          )}
          <Text style={{ color: '#999', marginTop: 8 }}>
            {hasCamerasConfigured ? 'RPi Camera' : 'Connect Camera'}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function ProductImageThumbnails({
  imageCount,
  thumbnailUrls,
  selectedIndex,
  thumbsRef,
  onSelectIndex,
  onScrollToIndex,
}: {
  imageCount: number;
  thumbnailUrls: string[];
  selectedIndex: number;
  thumbsRef: React.RefObject<ScrollableListHandle | null>;
  onSelectIndex: (index: number) => void;
  onScrollToIndex: (index: number) => void;
}) {
  if (imageCount <= 1) return null;

  return (
    <View style={{ marginTop: 12, paddingHorizontal: 16 }}>
      <GalleryFlatList
        ref={(instance: ScrollableListHandle | null) => {
          thumbsRef.current = instance;
        }}
        data={thumbnailUrls}
        horizontal
        showsHorizontalScrollIndicator={false}
        keyExtractor={(_, index: number) => String(index)}
        renderItem={({ item, index }: { item: string; index: number }) => (
          <Pressable
            onPress={() => {
              void onSelectIndex(index);
              onScrollToIndex(index);
            }}
            accessibilityRole="button"
            accessibilityLabel={`Select image ${index + 1}`}
            style={{
              marginRight: 8,
              borderRadius: 6,
              overflow: 'hidden',
              borderWidth: 2,
              borderColor: selectedIndex === index ? '#2196F3' : 'transparent',
            }}
          >
            <Image source={{ uri: item }} style={{ width: 60, height: 60 }} />
          </Pressable>
        )}
      />
    </View>
  );
}

export function ProductImageCameraDialogs({
  cameraPickerVisible,
  onDismissCameraPicker,
  onSelectCamera,
  previewCamera,
  onDismissPreview,
  isCapturing,
  onCapturePreview,
}: {
  cameraPickerVisible: boolean;
  onDismissCameraPicker: () => void;
  onSelectCamera: (camera: CameraReadWithStatus) => void;
  previewCamera: CameraReadWithStatus | null;
  onDismissPreview: () => void;
  isCapturing: boolean;
  onCapturePreview: () => void;
}) {
  return (
    <>
      <CameraPickerDialog
        visible={cameraPickerVisible}
        onDismiss={onDismissCameraPicker}
        onSelect={onSelectCamera}
      />

      <Portal>
        <Dialog
          visible={previewCamera !== null}
          onDismiss={onDismissPreview}
          style={{ maxWidth: 600, alignSelf: 'center', width: '100%' }}
        >
          <Dialog.Title>{previewCamera?.name ?? 'Camera preview'}</Dialog.Title>
          <Dialog.Content style={{ alignItems: 'center', gap: 12 }}>
            <LivePreview camera={previewCamera} enabled={previewCamera !== null} />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={onDismissPreview}>Cancel</Button>
            <Button
              mode="contained"
              disabled={isCapturing}
              loading={isCapturing}
              onPress={onCapturePreview}
            >
              Capture
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </>
  );
}

function IconActionButton({
  onPress,
  label,
  icon,
}: {
  onPress: () => void;
  label: string;
  icon: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel={label}
      style={{
        backgroundColor: 'rgba(0,0,0,0.45)',
        width: 36,
        height: 36,
        borderRadius: 18,
        justifyContent: 'center',
        alignItems: 'center',
      }}
    >
      <Icon source={icon} size={20} color="white" />
    </Pressable>
  );
}

function EmptyActionCard({
  onPress,
  label,
  accessibilityLabel,
  icon,
}: {
  onPress: () => void;
  label: string;
  accessibilityLabel: string;
  icon: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={{
        flex: 1,
        backgroundColor: '#eee',
        justifyContent: 'center',
        alignItems: 'center',
        borderRadius: 8,
        borderWidth: 2,
        borderColor: '#ccc',
        borderStyle: 'dashed',
      }}
    >
      <Icon source={icon} size={48} color="#999" />
      <Text style={{ color: '#999', marginTop: 8 }}>{label}</Text>
    </Pressable>
  );
}
