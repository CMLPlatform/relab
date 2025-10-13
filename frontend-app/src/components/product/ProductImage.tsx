import AsyncStorage from '@react-native-async-storage/async-storage';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Dimensions, FlatList, Platform, Pressable, View } from 'react-native';
import { Icon } from 'react-native-paper';
import { Product } from '@/types/Product';

type searchParams = {
  photoTaken?: 'taken' | 'set';
};

interface Props {
  product: Product;
  editMode: boolean;
  onImagesChange?: (images: { url: string; description: string; id: number }[]) => void;
}

// TODO: Only load images lazily when they come into view (or soon)
export default function ProductImage({ product, editMode, onImagesChange }: Props) {
  // Hooks
  const router = useRouter();
  const { photoTaken } = useLocalSearchParams<searchParams>();
  const imageGallery = useRef<FlatList>(null);
  const width = Dimensions.get('window').width;

  const [currentIndex, setCurrentIndex] = useState(0);
  const isWeb = Platform.OS === 'web';

  const canGoPrev = currentIndex > 0;
  const canGoNext = currentIndex < product.images.length - 1;

  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: any[] }) => {
    if (viewableItems?.length && viewableItems[0]?.index != null) {
      setCurrentIndex(viewableItems[0].index);
    }
  }).current;
  const viewabilityConfig = useRef({ viewAreaCoveragePercentThreshold: 60 }).current;

  // Effects
  useEffect(() => {
    if (photoTaken === 'taken') {
      AsyncStorage.getItem('lastPhoto').then((uri) => {
        if (!uri) return;

        product.images = [...product.images, { url: uri, description: '', id: 0 }];
        onImagesChange?.(product.images);

        AsyncStorage.removeItem('lastPhoto');
        router.setParams({ photoTaken: 'set' });
      });
    }
    if (photoTaken === 'set') {
      imageGallery.current?.scrollToIndex({ index: product.images.length - 1, animated: true });
      router.setParams({ photoTaken: undefined });
    }
  }, [photoTaken]);

  // Arrow key navigation on web
  useEffect(() => {
    if (!isWeb) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        if (canGoNext) goToIndex(currentIndex + 1);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        if (canGoPrev) goToIndex(currentIndex - 1);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isWeb, currentIndex, product.images.length, canGoPrev, canGoNext]);

  // Helper to scroll safely
  const goToIndex = (idx: number) => {
    const clamped = Math.max(0, Math.min(idx, product.images.length - 1));
    if (clamped === currentIndex) return;
    try {
      imageGallery.current?.scrollToIndex({ index: clamped, animated: true });
      setCurrentIndex(clamped);
    } catch {
      // In case FlatList hasn't measured yet, fallback to offset
      imageGallery.current?.scrollToOffset({ offset: clamped * width, animated: true });
      setCurrentIndex(clamped);
    }
  };

  // Render
  return (
    <View style={{ height: 400 }}>
      {product.images.length > 0 && (
        <FlatList
          data={product.images}
          ref={imageGallery}
          keyExtractor={(item, index) => index.toString()}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          decelerationRate="fast"
          snapToInterval={width}
          disableIntervalMomentum
          getItemLayout={(data, index) => ({ length: width, offset: width * index, index })}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={viewabilityConfig}
          renderItem={({ item }) => (
            <>
              <Image source={{ uri: item.url }} style={{ width: width, height: 400 }} contentFit="cover" />
              {editMode && (
                <Pressable
                  style={{
                    position: 'absolute',
                    top: 10,
                    right: 10,
                    padding: 8,
                    borderRadius: 12,
                    backgroundColor: 'rgba(160, 0, 0, 0.6)',
                  }}
                  onPress={() => {
                    product.images = product.images.filter((img) => img.url !== item.url);
                    onImagesChange?.(product.images);
                  }}
                >
                  <Icon source={'delete'} size={24} color={'white'} />
                </Pressable>
              )}
            </>
          )}
        />
      )}
      {product.images.length === 0 && (
        <Image
          source={{ uri: 'https://placehold.co/600x400?text=' + product.name.replace(' ', '+') }}
          style={{ width: '100%', height: '100%' }}
          contentFit="cover"
        />
      )}

      {/* Chevrons for web navigation */}
      {product.images.length > 1 && (
        <>
          <Pressable
            onPress={() => goToIndex(currentIndex - 1)}
            disabled={!canGoPrev}
            style={{
              position: 'absolute',
              top: '50%',
              left: 10,
              transform: [{ translateY: -20 }],
              padding: 8,
              borderRadius: 20,
              backgroundColor: 'rgba(0,0,0,0.4)',
              opacity: canGoPrev ? 1 : 0.4, // NEW: visual disable
            }}
            hitSlop={10}
          >
            <Icon source="chevron-left" size={28} color="white" />
          </Pressable>

          <Pressable
            onPress={() => goToIndex(currentIndex + 1)}
            disabled={!canGoNext}
            style={{
              position: 'absolute',
              top: '50%',
              right: 10,
              transform: [{ translateY: -20 }],
              padding: 8,
              borderRadius: 20,
              backgroundColor: 'rgba(0,0,0,0.4)',
              opacity: canGoNext ? 1 : 0.4, // NEW: visual disable
            }}
            hitSlop={10}
          >
            <Icon source="chevron-right" size={28} color="white" />
          </Pressable>
        </>
      )}

      {editMode && (
        <Pressable
          style={{
            position: 'absolute',
            bottom: 10,
            right: 10,
            padding: 8,
            borderRadius: 12,
            backgroundColor: 'rgba(0, 0, 0, 0.6)',
          }}
          onPress={() => {
            const params = { id: product.id };
            router.push({ pathname: '/products/[id]/camera', params: params });
          }}
        >
          <Icon source={'camera'} size={24} color={'white'} />
        </Pressable>
      )}
    </View>
  );
}
