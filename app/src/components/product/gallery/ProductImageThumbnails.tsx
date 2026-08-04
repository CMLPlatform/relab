import { Image } from 'expo-image';
import { memo, useCallback } from 'react';
import { Pressable, View } from 'react-native';
import ImagePlaceholder from '@/components/base/ImagePlaceholder';
import { useAppTheme } from '@/theme';
import {
  GalleryFlatList,
  type GalleryItem,
  galleryItemAltText,
  galleryItemKeyExtractor,
  type ScrollableListHandle,
} from './shared';
import { createGalleryStyles } from './styles';

type GalleryStyles = ReturnType<typeof createGalleryStyles>;

type Props = {
  imageCount: number;
  items: GalleryItem[];
  selectedIndex: number;
  thumbsRef: React.RefObject<ScrollableListHandle | null>;
  onSelectIndex: (index: number) => void;
  onScrollToIndex: (index: number) => void;
  /** Product/component name — the alt-text fallback when an image has no description. */
  fallbackLabel: string;
};

export function ProductImageThumbnails({
  imageCount,
  items,
  selectedIndex,
  thumbsRef,
  onSelectIndex,
  onScrollToIndex,
  fallbackLabel,
}: Props) {
  const theme = useAppTheme();
  const styles = createGalleryStyles(theme);
  const selectedBorderColor = theme.tokens.border.selected;

  const setThumbsRef = useCallback(
    (instance: ScrollableListHandle | null) => {
      thumbsRef.current = instance;
    },
    [thumbsRef],
  );
  const renderItem = useCallback(
    ({ item, index }: { item: GalleryItem; index: number }) => (
      <ThumbnailItem
        uri={item.thumbnailUrl}
        index={index}
        altText={galleryItemAltText(item, index, items.length, fallbackLabel)}
        selected={selectedIndex === index}
        selectedBorderColor={selectedBorderColor}
        styles={styles}
        onSelectIndex={onSelectIndex}
        onScrollToIndex={onScrollToIndex}
      />
    ),
    [
      items,
      fallbackLabel,
      selectedIndex,
      selectedBorderColor,
      styles,
      onSelectIndex,
      onScrollToIndex,
    ],
  );

  if (imageCount <= 1) return null;

  return (
    <View style={styles.thumbnailContainer}>
      <GalleryFlatList
        ref={setThumbsRef}
        data={items}
        horizontal
        showsHorizontalScrollIndicator={false}
        keyExtractor={galleryItemKeyExtractor}
        renderItem={renderItem}
      />
    </View>
  );
}

const ThumbnailItem = memo(function ThumbnailItem({
  uri,
  index,
  altText,
  selected,
  selectedBorderColor,
  styles,
  onSelectIndex,
  onScrollToIndex,
}: {
  uri: string | null;
  index: number;
  altText: string;
  selected: boolean;
  selectedBorderColor: string;
  styles: GalleryStyles;
  onSelectIndex: (index: number) => void;
  onScrollToIndex: (index: number) => void;
}) {
  const handlePress = useCallback(() => {
    onSelectIndex(index);
    onScrollToIndex(index);
  }, [onSelectIndex, onScrollToIndex, index]);

  return (
    <Pressable
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={`Select ${altText}`}
      style={[
        styles.thumbnailItem,
        { borderColor: selected ? selectedBorderColor : 'transparent' },
      ]}
    >
      {uri ? (
        // Decorative: the wrapping Pressable already carries the descriptive label.
        <Image source={{ uri }} style={{ width: 60, height: 60 }} accessibilityLabel="" />
      ) : (
        <ImagePlaceholder width={60} height={60} borderRadius={0} />
      )}
    </Pressable>
  );
});
