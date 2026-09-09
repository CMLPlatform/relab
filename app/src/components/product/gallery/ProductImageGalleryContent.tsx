import { Image } from 'expo-image';
import { memo, type RefObject, useCallback, useMemo } from 'react';
import { ActivityIndicator, Pressable, type StyleProp, View, type ViewStyle } from 'react-native';
import { AppText } from '@/components/base/AppText';
import { Icon, type IconName } from '@/components/base/Icon';
import ImagePlaceholder from '@/components/base/ImagePlaceholder';
import { IMAGE_FADE_MS } from '@/constants';
import { useAppTheme } from '@/theme';
import {
  GalleryFlatList,
  type GalleryItem,
  galleryItemAltText,
  galleryItemKeyExtractor,
  IMAGE_HEIGHT,
  type ImageSource,
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
  /** Product/component name — the alt-text fallback when an image has no description. */
  fallbackLabel: string;
  rpiTriggerRef?: RefObject<View | null>;
};

type EditModeOverlayProps = {
  showCameraOption: boolean;
  showRpiButton: boolean;
  hasCamerasConfigured: boolean;
  isCapturing: boolean;
  rpiCamerasLoading: boolean;
  onTakePhoto: () => void;
  onPickImage: () => void;
  onRpiCapture: () => void;
  onDeleteImage: () => void;
  rpiTriggerRef?: RefObject<View | null>;
  rpiButtonStyle: (state: { pressed: boolean }) => StyleProp<ViewStyle>;
  deleteButtonStyle: (state: { pressed: boolean }) => StyleProp<ViewStyle>;
};

function EditModeOverlay({
  showCameraOption,
  showRpiButton,
  hasCamerasConfigured,
  isCapturing,
  rpiCamerasLoading,
  onTakePhoto,
  onPickImage,
  onRpiCapture,
  onDeleteImage,
  rpiTriggerRef,
  rpiButtonStyle,
  deleteButtonStyle,
}: EditModeOverlayProps) {
  const theme = useAppTheme();
  return (
    <>
      <View className="absolute top-3 left-3 flex-row gap-2">
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
            ref={rpiTriggerRef}
            onPress={onRpiCapture}
            disabled={isCapturing || rpiCamerasLoading}
            accessibilityLabel={
              hasCamerasConfigured ? 'Capture from RPi camera' : 'Set up RPi camera'
            }
            className="h-11 w-11 items-center justify-center rounded-md"
            style={rpiButtonStyle}
          >
            {isCapturing || rpiCamerasLoading ? (
              <ActivityIndicator size={18} color={theme.tokens.text.onMedia} />
            ) : (
              <Icon name="camera" size="md" color={theme.tokens.text.onMedia} />
            )}
          </Pressable>
        ) : null}
      </View>

      <Pressable
        onPress={onDeleteImage}
        accessibilityRole="button"
        accessibilityLabel="Delete photo"
        // The undo toast auto-dismisses; a screen reader user must be told it exists.
        accessibilityHint="Removes it from this record. A message with an Undo button appears."
        className="absolute top-3 right-3 h-11 w-11 items-center justify-center rounded-md"
        style={deleteButtonStyle}
      >
        <Icon name="trash-2" size="md" color={theme.tokens.text.onMedia} />
      </Pressable>
    </>
  );
}

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
  fallbackLabel,
  rpiTriggerRef,
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
  const rpiButtonStyle = useCallback(
    ({ pressed }: { pressed: boolean }) => [
      styles.overlayIconButton,
      { opacity: isCapturing || rpiCamerasLoading ? 0.5 : 1 },
      pressed && { opacity: 0.7 },
    ],
    [styles, isCapturing, rpiCamerasLoading],
  );
  const deleteButtonStyle = useCallback(
    ({ pressed }: { pressed: boolean }) => [styles.deleteButton, pressed && { opacity: 0.7 }],
    [styles],
  );
  const renderItem = useCallback(
    ({ item, index }: { item: GalleryItem; index: number }) => (
      <GalleryImageItem
        uri={item.mediumUrl}
        sourceSet={item.sourceSet}
        placeholderUri={item.thumbnailUrl}
        index={index}
        width={width}
        altText={galleryItemAltText(item, index, items.length, fallbackLabel)}
        onSelectIndex={onSelectIndex}
        onOpenLightbox={onOpenLightbox}
      />
    ),
    [width, items, fallbackLabel, onSelectIndex, onOpenLightbox],
  );

  return (
    <View className="relative">
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
          <View
            className="absolute right-3 bottom-3 rounded-full px-3 py-1"
            style={styles.counterBadge}
          >
            <AppText
              variant="caption"
              style={{ color: theme.tokens.text.onMedia, fontWeight: 'bold' }}
            >
              {selectedIndex + 1} / {imageCount}
            </AppText>
          </View>
        </>
      ) : null}

      {editMode ? (
        <EditModeOverlay
          showCameraOption={showCameraOption}
          showRpiButton={showRpiButton}
          hasCamerasConfigured={hasCamerasConfigured}
          isCapturing={isCapturing}
          rpiCamerasLoading={rpiCamerasLoading}
          onTakePhoto={onTakePhoto}
          onPickImage={onPickImage}
          onRpiCapture={onRpiCapture}
          onDeleteImage={onDeleteImage}
          rpiTriggerRef={rpiTriggerRef}
          rpiButtonStyle={rpiButtonStyle}
          deleteButtonStyle={deleteButtonStyle}
        />
      ) : null}
    </View>
  );
}

const GalleryImageItem = memo(function GalleryImageItem({
  uri,
  sourceSet,
  placeholderUri,
  index,
  width,
  altText,
  onSelectIndex,
  onOpenLightbox,
}: {
  uri: string | null;
  sourceSet: ImageSource[];
  placeholderUri: string | null;
  index: number;
  width: number;
  altText: string;
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
      accessibilityLabel={`View ${altText}`}
    >
      {uri ? (
        // Decorative: the Pressable carries the label. expo-image drops an empty
        // alt, so hide the subtree.
        <View aria-hidden>
          <Image
            // Empty when the API has no dimensions; `uri` is then the size
            // picked in useProductGalleryMedia.
            source={sourceSet.length > 1 ? sourceSet : { uri }}
            // The cached list thumbnail paints immediately under the full-width image.
            placeholder={placeholderUri ? { uri: placeholderUri } : undefined}
            placeholderContentFit="cover"
            contentFit="cover"
            transition={IMAGE_FADE_MS}
            style={{ width, height: IMAGE_HEIGHT }}
          />
        </View>
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
  icon: IconName;
}) {
  const theme = useAppTheme();
  const styles = createGalleryStyles(theme);
  const pressableStyle = useCallback(
    ({ pressed }: { pressed: boolean }) => [styles.overlayIconButton, pressed && { opacity: 0.7 }],
    [styles],
  );
  return (
    <Pressable
      onPress={onPress}
      // Without a role, the browser discards aria-label (axe: aria-prohibited-attr).
      accessibilityRole="button"
      accessibilityLabel={label}
      className="h-11 w-11 items-center justify-center rounded-md"
      style={pressableStyle}
    >
      <Icon name={icon} size="md" color={theme.tokens.text.onMedia} />
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
  const pressableStyle = useCallback(
    ({ pressed }: { pressed: boolean }) => [
      styles.navButton,
      style,
      { opacity: disabled ? 0.3 : 1 },
      pressed && { opacity: 0.7 },
    ],
    [styles, style, disabled],
  );
  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel={label}
      disabled={disabled}
      hitSlop={15}
      className="absolute top-1/2 mt-[-22px] h-11 w-11 items-center justify-center rounded-md"
      style={pressableStyle}
    >
      <Icon
        name={direction === 'left' ? 'chevron-left' : 'chevron-right'}
        size={32}
        color={theme.tokens.text.onMedia}
      />
    </Pressable>
  );
}
