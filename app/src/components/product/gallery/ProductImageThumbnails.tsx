import { Image } from 'expo-image';
import { memo, useCallback } from 'react';
import { Platform, Pressable, View } from 'react-native';
import Animated, { LinearTransition, ReduceMotion } from 'react-native-reanimated';
import ImagePlaceholder from '@/components/base/ImagePlaceholder';
import { useAppTheme } from '@/theme';
import {
  GalleryFlatList,
  type GalleryItem,
  galleryItemAltText,
  galleryItemKeyExtractor,
  type ScrollableListHandle,
} from './shared';

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
        onSelectIndex={onSelectIndex}
        onScrollToIndex={onScrollToIndex}
      />
    ),
    [items, fallbackLabel, selectedIndex, selectedBorderColor, onSelectIndex, onScrollToIndex],
  );

  if (imageCount <= 1) return null;

  return (
    <View className="mt-3 px-4">
      {/* Component-level platform split, not a web-undefined animation prop:
          reanimated's web layout-animation path crashes on FlatList hosts (see
          the products-list-fade comment in products-screen/ListContent.tsx). */}
      {Platform.OS === 'web' ? (
        <GalleryFlatList
          ref={setThumbsRef}
          data={items}
          horizontal
          showsHorizontalScrollIndicator={false}
          keyExtractor={galleryItemKeyExtractor}
          renderItem={renderItem}
        />
      ) : (
        <Animated.FlatList
          ref={setThumbsRef as React.Ref<Animated.FlatList<GalleryItem>>}
          data={items}
          horizontal
          showsHorizontalScrollIndicator={false}
          keyExtractor={galleryItemKeyExtractor}
          renderItem={renderItem}
          itemLayoutAnimation={LinearTransition.duration(200).reduceMotion(ReduceMotion.System)}
        />
      )}
    </View>
  );
}

const ThumbnailItem = memo(function ThumbnailItem({
  uri,
  index,
  altText,
  selected,
  selectedBorderColor,
  onSelectIndex,
  onScrollToIndex,
}: {
  uri: string | null;
  index: number;
  altText: string;
  selected: boolean;
  selectedBorderColor: string;
  onSelectIndex: (index: number) => void;
  onScrollToIndex: (index: number) => void;
}) {
  const handlePress = useCallback(() => {
    onSelectIndex(index);
    onScrollToIndex(index);
  }, [onSelectIndex, onScrollToIndex, index]);

  const pressableStyle = useCallback(
    ({ pressed }: { pressed: boolean }) => [
      { borderColor: selected ? selectedBorderColor : 'transparent' },
      pressed && { opacity: 0.7 },
    ],
    [selected, selectedBorderColor],
  );

  // No per-item entering fade: entering fires on every MOUNT, and FlatList
  // windowing mounts items during ordinary scroll — the fade would flicker
  // there. LinearTransition on the list already animates real add/delete.
  return (
    <Pressable
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={`Select ${altText}`}
      className="mr-2 overflow-hidden rounded-md border-2"
      style={pressableStyle}
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
