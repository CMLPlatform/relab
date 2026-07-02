import { Image } from 'expo-image';
import { memo, useCallback, useMemo } from 'react';
import { Pressable, Text, View } from 'react-native';
import { ActivityIndicator, Icon } from 'react-native-paper';
import {
  GalleryFlatList,
  IMAGE_HEIGHT,
  indexKeyExtractor,
  makeHorizontalItemLayout,
  type ScrollableListHandle,
  type ScrollEvent,
} from '@/components/product/gallery/shared';
import { createGalleryStyles } from '@/components/product/gallery/styles';
import { useAppTheme } from '@/theme';

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
  const theme = useAppTheme();
  const styles = createGalleryStyles(theme);

  const setGalleryRef = useCallback(
    (instance: ScrollableListHandle | null) => {
      galleryRef.current = instance;
    },
    [galleryRef],
  );
  const getItemLayout = useMemo(() => makeHorizontalItemLayout(width), [width]);
  const renderItem = useCallback(
    ({ item, index }: { item: string; index: number }) => (
      <GalleryImageItem
        uri={item}
        index={index}
        width={width}
        onSelectIndex={onSelectIndex}
        onOpenLightbox={onOpenLightbox}
      />
    ),
    [width, onSelectIndex, onOpenLightbox],
  );

  return (
    <View style={styles.galleryContainer}>
      <GalleryFlatList
        ref={setGalleryRef}
        data={mediumUrls}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyExtractor={indexKeyExtractor}
        getItemLayout={getItemLayout}
        renderItem={renderItem}
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
          <View style={styles.counterBadge}>
            <Text style={{ color: theme.tokens.text.onMedia, fontSize: 12, fontWeight: 'bold' }}>
              {selectedIndex + 1} / {imageCount}
            </Text>
          </View>
        </>
      ) : null}

      {editMode ? (
        <>
          <View style={styles.overlayActionRow}>
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
                  styles.overlayIconButton,
                  { opacity: isCapturing || rpiCamerasLoading ? 0.5 : 1 },
                ]}
              >
                {isCapturing || rpiCamerasLoading ? (
                  <ActivityIndicator size={18} color={theme.tokens.text.onMedia} />
                ) : (
                  <Icon source="camera-wireless" size={20} color={theme.tokens.text.onMedia} />
                )}
              </Pressable>
            ) : null}
          </View>

          <Pressable
            onPress={onDeleteImage}
            accessibilityLabel="Delete photo"
            style={styles.deleteButton}
          >
            <Icon source="delete" size={20} color={theme.tokens.text.onMedia} />
          </Pressable>
        </>
      ) : null}
    </View>
  );
}

const GalleryImageItem = memo(function GalleryImageItem({
  uri,
  index,
  width,
  onSelectIndex,
  onOpenLightbox,
}: {
  uri: string;
  index: number;
  width: number;
  onSelectIndex: (index: number) => void;
  onOpenLightbox: (index: number) => void;
}) {
  const handlePress = useCallback(() => {
    onSelectIndex(index);
    onOpenLightbox(index);
  }, [onSelectIndex, onOpenLightbox, index]);

  return (
    <Pressable
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={`View image ${index + 1}`}
    >
      <Image source={{ uri }} contentFit="cover" style={{ width, height: IMAGE_HEIGHT }} />
    </Pressable>
  );
});

function OverlayActionButton({
  onPress,
  label,
  icon,
}: {
  onPress: () => void;
  label: string;
  icon: string;
}) {
  const theme = useAppTheme();
  const styles = createGalleryStyles(theme);
  return (
    <Pressable onPress={onPress} accessibilityLabel={label} style={styles.overlayIconButton}>
      <Icon source={icon} size={20} color={theme.tokens.text.onMedia} />
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
  const theme = useAppTheme();
  const styles = createGalleryStyles(theme);
  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel={label}
      disabled={disabled}
      hitSlop={15}
      style={[styles.navButton, style, { opacity: disabled ? 0.3 : 1 }]}
    >
      <Icon
        source={direction === 'left' ? 'chevron-left' : 'chevron-right'}
        size={32}
        color={theme.tokens.text.onMedia}
      />
    </Pressable>
  );
}
