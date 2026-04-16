import { Image } from 'expo-image';
import { Pressable, Text, View } from 'react-native';
import { ActivityIndicator, Icon } from 'react-native-paper';
import {
  GalleryFlatList,
  IMAGE_HEIGHT,
  type ScrollableListHandle,
  type ScrollEvent,
} from '@/components/product/gallery/shared';
import { galleryStyles } from '@/components/product/gallery/styles';

type Props = {
  width: number;
  imageCount: number;
  selectedIndex: number;
  mediumUrls: string[];
  galleryRef: React.RefObject<ScrollableListHandle | null>;
  onSelectIndex: (index: number) => void;
  onOpenLightbox: (index: number) => void;
  onPrev: () => void;
  onNext: () => void;
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
  galleryRef,
  onSelectIndex,
  onOpenLightbox,
  onPrev,
  onNext,
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
}: Props) {
  return (
    <View style={galleryStyles.galleryContainer}>
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
              onSelectIndex(index);
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
          <GalleryNavButton
            direction="left"
            label="Previous image"
            onPress={onPrev}
            disabled={selectedIndex === 0}
            style={{ left: 8 }}
          />
          <GalleryNavButton
            direction="right"
            label="Next image"
            onPress={onNext}
            disabled={selectedIndex === imageCount - 1}
            style={{ right: 8 }}
          />
          <View style={galleryStyles.counterBadge}>
            <Text style={{ color: 'white', fontSize: 12, fontWeight: 'bold' }}>
              {selectedIndex + 1} / {imageCount}
            </Text>
          </View>
        </>
      ) : null}

      {editMode ? (
        <>
          <View style={galleryStyles.overlayActionRow}>
            {showCameraOption ? (
              <OverlayActionButton onPress={onTakePhoto} label="Take photo" icon="camera" />
            ) : null}
            <OverlayActionButton
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
                style={[
                  galleryStyles.overlayIconButton,
                  { opacity: isCapturing || rpiCamerasLoading ? 0.5 : 1 },
                ]}
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
            style={galleryStyles.deleteButton}
          >
            <Icon source="delete" size={20} color="white" />
          </Pressable>
        </>
      ) : null}
    </View>
  );
}

function OverlayActionButton({
  onPress,
  label,
  icon,
}: {
  onPress: () => void;
  label: string;
  icon: string;
}) {
  return (
    <Pressable onPress={onPress} accessibilityLabel={label} style={galleryStyles.overlayIconButton}>
      <Icon source={icon} size={20} color="white" />
    </Pressable>
  );
}

function GalleryNavButton({
  direction,
  label,
  onPress,
  disabled,
  style,
}: {
  direction: 'left' | 'right';
  label: string;
  onPress: () => void;
  disabled: boolean;
  style: { left?: number; right?: number };
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel={label}
      disabled={disabled}
      hitSlop={15}
      style={[galleryStyles.navButton, style, { opacity: disabled ? 0.3 : 1 }]}
    >
      <Icon
        source={direction === 'left' ? 'chevron-left' : 'chevron-right'}
        size={32}
        color="white"
      />
    </Pressable>
  );
}
