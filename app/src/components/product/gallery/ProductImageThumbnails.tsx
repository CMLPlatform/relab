import { Image } from 'expo-image';
import { memo, useCallback } from 'react';
import { Pressable, View } from 'react-native';
import { useAppTheme } from '@/theme';
import { GalleryFlatList, indexKeyExtractor, type ScrollableListHandle } from './shared';
import { createGalleryStyles } from './styles';

type GalleryStyles = ReturnType<typeof createGalleryStyles>;

type Props = {
  imageCount: number;
  thumbnailUrls: string[];
  selectedIndex: number;
  thumbsRef: React.RefObject<ScrollableListHandle | null>;
  onSelectIndex: (index: number) => void;
  onScrollToIndex: (index: number) => void;
};

export function ProductImageThumbnails({
  imageCount,
  thumbnailUrls,
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
    ({ item, index }: { item: string; index: number }) => (
      <ThumbnailItem
        uri={item}
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
        data={thumbnailUrls}
        horizontal
        showsHorizontalScrollIndicator={false}
        keyExtractor={indexKeyExtractor}
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
  uri: string;
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
      <Image source={{ uri }} style={{ width: 60, height: 60 }} />
    </Pressable>
  );
});
