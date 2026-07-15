import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { type ComponentProps, memo, useCallback, useMemo } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import ImagePlaceholder from '@/components/base/ImagePlaceholder';
import { useAppTheme } from '@/theme';
import {
  GalleryFlatList,
  type GalleryItem,
  galleryItemKeyExtractor,
  IMAGE_HEIGHT,
  makeHorizontalItemLayout,
  type ScrollableListHandle,
  type ScrollEvent,
} from './shared';
import { createGalleryStyles } from './styles';

type Props = {
  width: number;
  imageCount: number;
  selectedIndex: number;
  items: GalleryItem[];
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
  items,
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
    ({ item, index }: { item: GalleryItem; index: number }) => (
      <GalleryImageItem
        uri={item.mediumUrl}
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
        data={items}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyExtractor={galleryItemKeyExtractor}
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
                  <MaterialCommunityIcons
                    name="camera-wireless"
                    size={20}
                    color={theme.tokens.text.onMedia}
                  />
                )}
              </Pressable>
            ) : null}
          </View>

          <Pressable
            onPress={onDeleteImage}
            accessibilityLabel="Delete photo"
            style={styles.deleteButton}
          >
            <MaterialCommunityIcons name="delete" size={20} color={theme.tokens.text.onMedia} />
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
  uri: string | null;
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
      {uri ? (
        <Image source={{ uri }} contentFit="cover" style={{ width, height: IMAGE_HEIGHT }} />
      ) : (
        <ImagePlaceholder width={width} height={IMAGE_HEIGHT} borderRadius={0} />
      )}
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
  icon: ComponentProps<typeof MaterialCommunityIcons>['name'];
}) {
  const theme = useAppTheme();
  const styles = createGalleryStyles(theme);
  return (
    <Pressable onPress={onPress} accessibilityLabel={label} style={styles.overlayIconButton}>
      <MaterialCommunityIcons name={icon} size={20} color={theme.tokens.text.onMedia} />
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
      <MaterialCommunityIcons
        name={direction === 'left' ? 'chevron-left' : 'chevron-right'}
        size={32}
        color={theme.tokens.text.onMedia}
      />
    </Pressable>
  );
}
