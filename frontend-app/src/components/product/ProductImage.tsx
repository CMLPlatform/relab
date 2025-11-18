//MAIN ProductImage.tsx

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Modal,
  Platform,
  Pressable,
  StatusBar,
  Text,
  useColorScheme,
  View,
} from 'react-native';
import { Icon } from 'react-native-paper';

import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useDialog } from '@/components/common/DialogProvider';

import { processImage } from '@/services/media/imageProcessing';
import { Product } from '@/types/Product';

interface Props {
  product: Product;
  editMode: boolean;
  onImagesChange?: (images: { url: string; description: string; id: number }[]) => void;
}

// TODO: Only load images lazily when they come into view (or soon)
export default function ProductImages({ product, editMode, onImagesChange }: Props) {
  // Hooks
  const dialog = useDialog();
  const imageGallery = useRef<FlatList>(null);
  const width = Dimensions.get('window').width;
  const darkMode = useColorScheme() === 'dark';
  const isWeb = Platform.OS === 'web';

  // States
  const [currentIndex, setCurrentIndex] = useState(0);
  const [imageCount, setImageCount] = useState(product.images.length);
  const [pendingScrollIndex, setPendingScrollIndex] = useState<number | null>(null);
  const [lightboxVisible, setLightboxVisible] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  const canGoPrev = currentIndex > 0;
  const canGoNext = currentIndex < imageCount - 1;

  // Refs and Callbacks
  const goToIndex = useCallback(
    (idx: number) => {
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
    },
    [imageCount, currentIndex, width],
  );

  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: any[] }) => {
    if (viewableItems?.length && viewableItems[0]?.index != null) {
      setCurrentIndex(viewableItems[0].index);
    }
  }).current;
  const viewabilityConfig = useRef({ viewAreaCoveragePercentThreshold: 75 }).current;

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
  }, [goToIndex, imageCount, pendingScrollIndex]);

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
  }, [isWeb, currentIndex, imageCount, canGoPrev, canGoNext, goToIndex]);

  // TODO: Add dedicated gallery view with thumbnails
  // TODO: Add hold/click to see image details (filename, size, dimensions, date)
  // TODO: Add a way to see the full image in a modal

  // Callbacks
  const onImageDelete = (imageUrl: string) => {
    product.images = product.images.filter((img) => img.url !== imageUrl);
    onImagesChange?.(product.images);
  };

  const onTakePhoto = async () => {
    // Request camera permission
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      await dialog.alert({
        title: 'Permission Required',
        message: 'Camera permission is required to take photos',
      });
      return;
    }

    try {
      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        mediaTypes: 'images',
      });

      if (result.canceled) {
        return;
      }

      // Process the captured image
      const processedUri = await processImage(result.assets[0], {
        onError: (error) => {
          dialog.alert({
            title: error.type === 'size' ? 'Image too large' : 'Processing failed',
            message: error.message,
          });
        },
      });

      if (processedUri) {
        product.images = [...product.images, { url: processedUri, description: '', id: 0 }];
        onImagesChange?.(product.images);
        setPendingScrollIndex(product.images.length - 1);
      }
    } catch (error: any) {
      console.error('Camera error:', error);
      if (error.message?.includes('Unsupported file type')) {
        await dialog.alert({
          title: 'Unsupported file',
          message: 'Please select an image file.',
        });
      }
    }
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

  const openLightbox = () => {
    setLightboxIndex(currentIndex);
    setLightboxVisible(true);
  };

  const closeLightbox = () => {
    setLightboxVisible(false);
  };

  const navigateLightbox = (direction: 'prev' | 'next') => {
    if (direction === 'prev' && lightboxIndex > 0) {
      setLightboxIndex(lightboxIndex - 1);
    } else if (direction === 'next' && lightboxIndex < product.images.length - 1) {
      setLightboxIndex(lightboxIndex + 1);
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

      {/* Toolbar with expand and edit buttons */}
      {(editMode || product.images.length > 0) && (
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
          {product.images.length > 0 && <ToolbarIcon icon={'fullscreen'} onPress={openLightbox} />}
          {editMode && (
            <>
              <ToolbarIcon icon={'upload'} onPress={onImagePicker} />
              <ToolbarIcon icon={'camera'} onPress={onTakePhoto} />
            </>
          )}
        </View>
      )}

      {/* Lightbox Modal */}
      <ImageLightbox
        visible={lightboxVisible}
        images={product.images}
        currentIndex={lightboxIndex}
        onClose={closeLightbox}
        onNavigate={navigateLightbox}
      />
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

interface ImageLightboxProps {
  visible: boolean;
  images: { url: string; description: string; id: number }[];
  currentIndex: number;
  onClose: () => void;
  onNavigate: (direction: 'prev' | 'next') => void;
}

function ImageLightbox({ visible, images, currentIndex, onClose, onNavigate }: ImageLightboxProps) {
  const { width, height } = Dimensions.get('window');
  const isWeb = Platform.OS === 'web';
  const lightboxGallery = useRef<FlatList>(null);

  // Sync FlatList with currentIndex changes
  useEffect(() => {
    if (visible && lightboxGallery.current) {
      lightboxGallery.current.scrollToIndex({ index: currentIndex, animated: true });
    }
  }, [currentIndex, visible]);

  // Keyboard navigation on web
  useEffect(() => {
    if (!visible || !isWeb) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        if (currentIndex < images.length - 1) {
          onNavigate('next');
        }
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        if (currentIndex > 0) {
          onNavigate('prev');
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [visible, isWeb, currentIndex, images.length, onClose, onNavigate]);

  if (!visible) return null;

  const canGoPrev = currentIndex > 0;
  const canGoNext = currentIndex < images.length - 1;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.95)' }}>
        {/* Close Button */}
        <Pressable
          onPress={onClose}
          style={{
            position: 'absolute',
            top: Platform.OS === 'ios' ? 50 : StatusBar.currentHeight || 20,
            right: 20,
            zIndex: 10,
            padding: 8,
            borderRadius: 20,
            backgroundColor: 'rgba(0, 0, 0, 0.6)',
          }}
        >
          <Icon source="close" size={28} color="white" />
        </Pressable>

        {/* Image Counter */}
        <Text
          style={{
            position: 'absolute',
            top: Platform.OS === 'ios' ? 50 : StatusBar.currentHeight || 20,
            left: 20,
            zIndex: 10,
            padding: 8,
            borderRadius: 12,
            backgroundColor: 'rgba(0, 0, 0, 0.6)',
            color: 'white',
            fontSize: 16,
            fontWeight: 'bold',
          }}
        >
          {`${currentIndex + 1} / ${images.length}`}
        </Text>

        {/* Image Gallery */}
        <FlatList
          ref={lightboxGallery}
          data={images}
          keyExtractor={(item, index) => `lightbox-${index}`}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          decelerationRate="fast"
          snapToInterval={width}
          disableIntervalMomentum
          getItemLayout={(data, index) => ({ length: width, offset: width * index, index })}
          initialScrollIndex={currentIndex}
          renderItem={({ item }) => (
            <View
              style={{
                width: width,
                height: height,
                justifyContent: 'center',
                alignItems: 'center',
              }}
            >
              <Image
                source={{ uri: item.url }}
                style={{
                  width: width,
                  height: height,
                }}
                contentFit="contain"
              />
            </View>
          )}
        />

        {/* Navigation Arrows */}
        {images.length > 1 && (
          <>
            <Pressable
              onPress={() => onNavigate('prev')}
              disabled={!canGoPrev}
              style={{
                position: 'absolute',
                top: '50%',
                left: 20,
                transform: [{ translateY: -20 }],
                padding: 12,
                borderRadius: 24,
                backgroundColor: 'rgba(0, 0, 0, 0.6)',
                opacity: canGoPrev ? 1 : 0.3,
              }}
            >
              <Icon source="chevron-left" size={32} color="white" />
            </Pressable>

            <Pressable
              onPress={() => onNavigate('next')}
              disabled={!canGoNext}
              style={{
                position: 'absolute',
                top: '50%',
                right: 20,
                transform: [{ translateY: -20 }],
                padding: 12,
                borderRadius: 24,
                backgroundColor: 'rgba(0, 0, 0, 0.6)',
                opacity: canGoNext ? 1 : 0.3,
              }}
            >
              <Icon source="chevron-right" size={32} color="white" />
            </Pressable>
          </>
        )}
      </View>
    </Modal>
  );
}
