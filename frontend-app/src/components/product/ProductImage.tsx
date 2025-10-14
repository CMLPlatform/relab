//MAIN ProductImage.tsx

import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Dimensions, FlatList, Platform, Pressable, Text, useColorScheme, View } from 'react-native';
import { Icon } from 'react-native-paper';

import { useLocalSearchParams, useRouter } from 'expo-router';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useDialog } from '@/components/common/DialogProvider';

import { processImage } from '@/services/media/imageProcessing';
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
export default function ProductImages({ product, editMode, onImagesChange }: Props) {
  // Hooks
  const router = useRouter();
  const dialog = useDialog();
  const { photoTaken } = useLocalSearchParams<searchParams>();
  const imageGallery = useRef<FlatList>(null);
  const width = Dimensions.get('window').width;
  const darkMode = useColorScheme() === 'dark';
  const isWeb = Platform.OS === 'web';

  // States
  const [currentIndex, setCurrentIndex] = useState(0);
  const [imageCount, setImageCount] = useState(product.images.length);
  const [pendingScrollIndex, setPendingScrollIndex] = useState<number | null>(null);

  const canGoPrev = currentIndex > 0;
  const canGoNext = currentIndex < imageCount - 1;

  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: any[] }) => {
    if (viewableItems?.length && viewableItems[0]?.index != null) {
      setCurrentIndex(viewableItems[0].index);
    }
  }).current;
  const viewabilityConfig = useRef({ viewAreaCoveragePercentThreshold: 60 }).current;

  // Effects
  useEffect(() => {
    setImageCount(product.images.length);
  }, [product.images.length]);

  // Handle pending scroll after image count updates
  useEffect(() => {
    if (pendingScrollIndex !== null && pendingScrollIndex < imageCount) {
      goToIndex(pendingScrollIndex);
      setPendingScrollIndex(null);
    }
  }, [imageCount, pendingScrollIndex]);

  useEffect(() => {
    // If a photo was taken, get it from AsyncStorage and add it to the product images
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
      setPendingScrollIndex(product.images.length - 1);
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
  }, [isWeb, currentIndex, imageCount, canGoPrev, canGoNext]);

  // Helper to scroll safely
  const goToIndex = (idx: number) => {
    const clamped = Math.max(0, Math.min(idx, imageCount - 1));
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

  // Callbacks
  const onImageDelete = (imageUrl: string) => {
    product.images = product.images.filter((img) => img.url !== imageUrl);
    onImagesChange?.(product.images);
  };

  const onOpenCamera = () => {
    const params = { id: product.id };
    router.push({ pathname: '/products/[id]/camera', params: params });
  };

  const onImagePicker = async () => {
    // No permissions request is necessary for launching the image library
    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 1,
    });

    if (result.canceled) {
      return;
    }

    // Process all selected images
    const processedImages: { url: string; description: string; id: number }[] = [];

    for (const asset of result.assets) {
      const processedUri = await processImage(asset, {
        onError: (error) => {
          dialog.alert({
            title: error.type === 'size' ? 'Image too large' : 'Processing failed',
            message: error.message,
          });
        },
      });

      if (processedUri) {
        processedImages.push({ url: processedUri, description: '', id: 0 });
      }
    }

    if (processedImages.length === 0) {
      return;
    }

    product.images = [...product.images, ...processedImages];
    onImagesChange?.(product.images);

    // Queue the scroll to happen after state updates
    setPendingScrollIndex(product.images.length - 1);
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
          renderItem={({ item, index }) => (
            <SingleImage
              uri={item.url}
              editMode={editMode}
              onDelete={onImageDelete}
              index={index + 1}
              maxIndex={product.images.length}
            />
          )}
        />
      )}
      {product.images.length === 0 && (
        <Image
          source={{ uri: `https://placehold.co/${width}x400?text=` + product.name.replace(' ', '+') }}
          // @ts-ignore inverting seems to work no problem
          style={{
            width: '100%',
            height: '100%',
            filter: darkMode ? 'invert(1)' : undefined,
          }}
          contentFit="cover"
        />
      )}

      {/* Chevrons for web navigation */}
      {imageCount > 1 && (
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
              opacity: canGoPrev ? 1 : 0.4,
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
              opacity: canGoNext ? 1 : 0.4,
            }}
            hitSlop={10}
          >
            <Icon source="chevron-right" size={28} color="white" />
          </Pressable>
        </>
      )}

      {editMode && (
        <View
          style={{
            position: 'absolute',
            bottom: 0,
            right: 0,
            flexDirection: 'row',
            justifyContent: 'flex-end',
            gap: 10,
            padding: 10,
          }}
        >
          <ToolbarIcon icon={'upload'} onPress={onImagePicker} />
          <ToolbarIcon icon={'camera'} onPress={onOpenCamera} />
        </View>
      )}
    </View>
  );
}

interface singeImageProps {
  uri: string;
  editMode: boolean;
  index: number;
  maxIndex: number;
  onDelete?: (imageUrl: string) => void;
}

function SingleImage({ uri, editMode, index, maxIndex, onDelete }: singeImageProps) {
  const width = Dimensions.get('window').width;
  const [loaded, setLoaded] = useState(false);

  return (
    <View
      style={{
        width: width,
        height: 400,
        justifyContent: 'center',
        alignItems: 'center',
      }}
    >
      <Image
        source={{ uri: uri }}
        style={{ width: loaded ? width : 1, height: loaded ? 400 : 1 }}
        contentFit="cover"
        onLoad={() => setLoaded(true)}
      />
      {loaded || <ActivityIndicator size="large" />}
      <Text
        style={{
          position: 'absolute',
          top: 10,
          left: 10,
          padding: 6,
          borderRadius: 12,
          backgroundColor: 'rgba(0, 0, 0, 0.6)',
          color: 'white',
          fontSize: 14,
        }}
      >
        {`${index} / ${maxIndex}`}
      </Text>
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
          onPress={() => onDelete?.(uri)}
        >
          <Icon source={'delete'} size={24} color={'white'} />
        </Pressable>
      )}
    </View>
  );
}

function ToolbarIcon({ icon, onPress }: { icon: string; onPress: () => void }) {
  return (
    <Pressable
      style={{
        padding: 8,
        borderRadius: 12,
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
      }}
      onPress={onPress}
    >
      <Icon source={icon} size={24} color={'white'} />
    </Pressable>
  );
}
