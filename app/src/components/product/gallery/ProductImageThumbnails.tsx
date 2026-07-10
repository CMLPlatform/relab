import { Image } from 'expo-image';
import { memo, useCallback } from 'react';
import { Pressable, View } from 'react-native';
import ImagePlaceholder from '@/components/base/ImagePlaceholder';
import { useAppTheme } from '@/theme';
import {
  GalleryFlatList,
  type GalleryItem,
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
};

export function ProductImageThumbnails({
  imageCount,
  items,
  selectedIndex,
  thumbsRef,
  onSelectIndex,
  onScrollToIndex,
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
        selected={selectedIndex === index}
        selectedBorderColor={selectedBorderColor}
        styles={styles}
        onSelectIndex={onSelectIndex}
        onScrollToIndex={onScrollToIndex}
      />
    ),
    [selectedIndex, selectedBorderColor, styles, onSelectIndex, onScrollToIndex],
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
  selected,
  selectedBorderColor,
  styles,
  onSelectIndex,
  onScrollToIndex,
}: {
  uri: string | null;
  index: number;
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
      accessibilityLabel={`Select image ${index + 1}`}
      style={[
        styles.thumbnailItem,
        { borderColor: selected ? selectedBorderColor : 'transparent' },
      ]}
    >
      {uri ? (
        <Image source={{ uri }} style={{ width: 60, height: 60 }} />
      ) : (
        <ImagePlaceholder width={60} height={60} borderRadius={0} />
      )}
    </Pressable>
  );
});
