import { Image } from 'expo-image';
import { Pressable, View } from 'react-native';
import { GalleryFlatList, type ScrollableListHandle } from '@/components/product/gallery/shared';
import { galleryStyles } from '@/components/product/gallery/styles';

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
  if (imageCount <= 1) return null;

  return (
    <View style={galleryStyles.thumbnailContainer}>
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
              onSelectIndex(index);
              onScrollToIndex(index);
            }}
            accessibilityRole="button"
            accessibilityLabel={`Select image ${index + 1}`}
            style={[
              galleryStyles.thumbnailItem,
              { borderColor: selectedIndex === index ? '#2196F3' : 'transparent' },
            ]}
          >
            <Image source={{ uri: item }} style={{ width: 60, height: 60 }} />
          </Pressable>
        )}
      />
    </View>
  );
}
