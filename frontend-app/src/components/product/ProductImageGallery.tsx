// spell-checker: ignore Zoomable

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Dimensions, Modal, Platform, Pressable, FlatList as RNFlatList, Text, View } from 'react-native';
import { FlatList as GHFlatList, GestureHandlerRootView } from 'react-native-gesture-handler';
import { Icon } from 'react-native-paper';

import ZoomableImage from '@/components/common/ZoomableImage';
import { resolveApiMediaUrl } from '@/services/api/media';
import { processImage } from '@/services/media/imageProcessing';
import { Product } from '@/types/Product';

const GalleryFlatList = Platform.OS === 'web' ? (RNFlatList as any) : GHFlatList;

const IMAGE_HEIGHT = 300;

function isLocalImageUrl(url: string): boolean {
  return /^(file:|blob:|data:)/.test(url);
}

function getDisplayImageUrl(url: string, id: number | undefined, width: number): string {
  if (!id || isLocalImageUrl(url)) {
    return resolveApiMediaUrl(url) ?? url;
  }

  return resolveApiMediaUrl(`/images/${id}/resized?width=${width}`) ?? resolveApiMediaUrl(url) ?? url;
}

interface Props {
  product: Product;
  editMode: boolean;
  onImagesChange?: (images: { url: string; description: string; id?: number }[]) => void;
}

export default function ProductImageGallery({ product, editMode, onImagesChange }: Props) {
  const { width } = Dimensions.get('window');
  const isWeb = Platform.OS === 'web';
  const showCameraOption =
    Platform.OS !== 'web' || (typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches);
  const images = useMemo(() => product.images ?? [], [product.images]);

  const galleryRef = useRef<any>(null);
  const thumbsRef = useRef<any>(null);

  const [selectedIndex, setSelectedIndex] = useState(0);
  const [pendingIndex, setPendingIndex] = useState<number | null>(null);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const previousLightboxOpenRef = useRef(false);

  const imageCount = images.length;

  const resolvedUrls = useMemo(() => images.map((i) => resolveApiMediaUrl(i.url) ?? i.url), [images]);
  const thumbnailUrls = useMemo(
    () => images.map((i) => i.thumbnailUrl ?? resolveApiMediaUrl(i.url) ?? i.url),
    [images],
  );
  const mediumUrls = useMemo(() => images.map((i) => getDisplayImageUrl(i.url, i.id, 800)), [images]);
  const largeUrls = useMemo(() => images.map((i) => getDisplayImageUrl(i.url, i.id, 1600)), [images]);

  const scrollToIndex = useCallback(
    (idx: number) => {
      const clamped = Math.max(0, Math.min(idx, imageCount - 1));
      try {
        galleryRef.current?.scrollToIndex({ index: clamped, animated: true });
      } catch {
        galleryRef.current?.scrollToOffset({ offset: clamped * width, animated: true });
      }
    },
    [imageCount, width],
  );

  useEffect(() => {
    if (pendingIndex !== null) {
      scrollToIndex(pendingIndex);
      setPendingIndex(null);
    }
  }, [pendingIndex, scrollToIndex]);

  useEffect(() => {
    if (previousLightboxOpenRef.current && !lightboxOpen && imageCount > 0) {
      scrollToIndex(selectedIndex);
    }

    previousLightboxOpenRef.current = lightboxOpen;
  }, [imageCount, lightboxOpen, scrollToIndex, selectedIndex]);

  // Pre-fetch images
  const webImagesRef = useRef<HTMLImageElement[]>([]);
  useEffect(() => {
    if (!isWeb) {
      resolvedUrls.forEach((url) => {
        Image.prefetch(url);
      });
    } else {
      // Background pre-fetch for web
      resolvedUrls.forEach((url, i) => {
        const img = new (window as any).Image();
        img.src = url;
        webImagesRef.current[i] = img;
      });
    }
  }, [resolvedUrls, isWeb]);

  const { id: productId } = useLocalSearchParams();
  useEffect(() => {
    const loadLastIndex = async () => {
      try {
        const key = `product_gallery_index_${productId}`;
        const saved = await AsyncStorage.getItem(key);
        if (saved !== null) {
          const idx = parseInt(saved, 10);
          if (idx >= 0 && idx < imageCount) {
            setPendingIndex(idx);
          }
        }
      } catch (e) {
        console.warn('Failed to load gallery index', e);
      }
    };
    if (productId && imageCount > 0) {
      loadLastIndex();
    }
  }, [productId, imageCount]);

  const updateCurrentIndex = useCallback(
    async (idx: number) => {
      const clampedIndex = imageCount > 0 ? Math.max(0, Math.min(idx, imageCount - 1)) : 0;
      setSelectedIndex(clampedIndex);
      try {
        const key = `product_gallery_index_${productId}`;
        await AsyncStorage.setItem(key, String(clampedIndex));
      } catch (e) {
        console.warn('Failed to save gallery index', e);
      }
    },
    [imageCount, productId],
  );

  useEffect(() => {
    if (!isWeb || lightboxOpen || imageCount <= 1) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        const next = Math.max(0, selectedIndex - 1);
        void updateCurrentIndex(next);
        scrollToIndex(next);
      } else if (e.key === 'ArrowRight') {
        const next = Math.min(imageCount - 1, selectedIndex + 1);
        void updateCurrentIndex(next);
        scrollToIndex(next);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [imageCount, isWeb, lightboxOpen, scrollToIndex, selectedIndex, updateCurrentIndex]);

  const handlePickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      quality: 0.8,
    });

    if (!result.canceled) {
      const newImages = await Promise.all(
        result.assets.map(async (asset) => {
          const processedUri = await processImage(asset);
          return {
            url: processedUri ?? asset.uri,
            description: '',
          };
        }),
      );
      onImagesChange?.([...images, ...newImages]);
    }
  };

  const handleTakePhoto = async () => {
    if (Platform.OS !== 'web') {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (permission.status !== 'granted') return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.8 });
    if (!result.canceled) {
      const asset = result.assets[0];
      const processedUri = await processImage(asset);
      onImagesChange?.([...images, { url: processedUri ?? asset.uri, description: '' }]);
    }
  };

  const handleDeleteImage = (index: number) => {
    const newImages = [...images];
    newImages.splice(index, 1);
    onImagesChange?.(newImages);
    void updateCurrentIndex(Math.max(0, Math.min(index, newImages.length - 1)));
  };

  if (imageCount === 0 && !editMode) {
    return (
      <View style={{ marginBottom: 16 }}>
        <Image
          source={{ uri: `https://placehold.co/600x400?text=${encodeURIComponent(product.name)}` }}
          contentFit="cover"
          style={{ width, height: IMAGE_HEIGHT, borderRadius: 8 }}
        />
      </View>
    );
  }

  return (
    <View style={{ marginBottom: 16 }}>
      {imageCount > 0 ? (
        <View style={{ position: 'relative' }}>
          <GalleryFlatList
            ref={galleryRef}
            data={mediumUrls}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            keyExtractor={(_: any, i: number) => String(i)}
            getItemLayout={(_: any, index: number) => ({
              length: width,
              offset: width * index,
              index,
            })}
            renderItem={({ item, index }: { item: string; index: number }) => (
              <Pressable
                onPress={() => {
                  void updateCurrentIndex(index);
                  setLightboxOpen(true);
                }}
                accessibilityRole="button"
                accessibilityLabel={`View image ${index + 1}`}
              >
                <Image source={{ uri: item }} contentFit="cover" style={{ width, height: IMAGE_HEIGHT }} />
              </Pressable>
            )}
            onMomentumScrollEnd={(e: any) => {
              const idx = Math.round(e.nativeEvent.contentOffset.x / width);
              void updateCurrentIndex(idx);
            }}
            onScrollEndDrag={(e: any) => {
              const idx = Math.round(e.nativeEvent.contentOffset.x / width);
              void updateCurrentIndex(idx);
            }}
          />

          {imageCount > 1 && (
            <>
              <Pressable
                onPress={() => {
                  const next = Math.max(0, selectedIndex - 1);
                  void updateCurrentIndex(next);
                  scrollToIndex(next);
                }}
                accessibilityLabel="Previous image"
                disabled={selectedIndex === 0}
                hitSlop={15}
                style={{
                  position: 'absolute',
                  left: 8,
                  top: '50%',
                  marginTop: -22,
                  width: 44,
                  height: 44,
                  borderRadius: 22,
                  justifyContent: 'center',
                  alignItems: 'center',
                  backgroundColor: 'rgba(0,0,0,0.35)',
                  opacity: selectedIndex === 0 ? 0.3 : 1,
                }}
              >
                <Icon source="chevron-left" size={32} color="white" />
              </Pressable>

              <Pressable
                onPress={() => {
                  const next = Math.min(imageCount - 1, selectedIndex + 1);
                  void updateCurrentIndex(next);
                  scrollToIndex(next);
                }}
                accessibilityLabel="Next image"
                disabled={selectedIndex === imageCount - 1}
                hitSlop={15}
                style={{
                  position: 'absolute',
                  right: 8,
                  top: '50%',
                  marginTop: -22,
                  width: 44,
                  height: 44,
                  borderRadius: 22,
                  justifyContent: 'center',
                  alignItems: 'center',
                  backgroundColor: 'rgba(0,0,0,0.35)',
                  opacity: selectedIndex === imageCount - 1 ? 0.3 : 1,
                }}
              >
                <Icon source="chevron-right" size={32} color="white" />
              </Pressable>
            </>
          )}

          {imageCount > 1 && (
            <View
              style={{
                position: 'absolute',
                bottom: 12,
                right: 12,
                backgroundColor: 'rgba(0,0,0,0.6)',
                paddingHorizontal: 12,
                paddingVertical: 4,
                borderRadius: 16,
              }}
            >
              <Text style={{ color: 'white', fontSize: 12, fontWeight: 'bold' }}>
                {selectedIndex + 1} / {imageCount}
              </Text>
            </View>
          )}

          {editMode && (
            <>
              <View style={{ position: 'absolute', top: 12, left: 12, flexDirection: 'row', gap: 8 }}>
                {showCameraOption && (
                  <Pressable
                    onPress={handleTakePhoto}
                    accessibilityLabel="Take photo"
                    style={{
                      backgroundColor: 'rgba(0,0,0,0.45)',
                      width: 36,
                      height: 36,
                      borderRadius: 18,
                      justifyContent: 'center',
                      alignItems: 'center',
                    }}
                  >
                    <Icon source="camera" size={20} color="white" />
                  </Pressable>
                )}
                <Pressable
                  onPress={handlePickImage}
                  accessibilityLabel="Add photo from gallery"
                  style={{
                    backgroundColor: 'rgba(0,0,0,0.45)',
                    width: 36,
                    height: 36,
                    borderRadius: 18,
                    justifyContent: 'center',
                    alignItems: 'center',
                  }}
                >
                  <Icon source="image-plus" size={20} color="white" />
                </Pressable>
              </View>

              <Pressable
                onPress={() => handleDeleteImage(selectedIndex)}
                accessibilityLabel="Delete photo"
                style={{
                  position: 'absolute',
                  top: 12,
                  right: 12,
                  backgroundColor: 'rgba(255,50,50,0.8)',
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  justifyContent: 'center',
                  alignItems: 'center',
                }}
              >
                <Icon source="delete" size={20} color="white" />
              </Pressable>
            </>
          )}
        </View>
      ) : (
        editMode && (
          <View style={{ flexDirection: 'row', gap: 12, height: IMAGE_HEIGHT }}>
            {showCameraOption && (
              <Pressable
                onPress={handleTakePhoto}
                accessibilityRole="button"
                accessibilityLabel="Take photo with camera"
                style={{
                  flex: 1,
                  backgroundColor: '#eee',
                  justifyContent: 'center',
                  alignItems: 'center',
                  borderRadius: 8,
                  borderWidth: 2,
                  borderColor: '#ccc',
                  borderStyle: 'dashed',
                }}
              >
                <Icon source="camera" size={48} color="#999" />
                <Text style={{ color: '#999', marginTop: 8 }}>Camera</Text>
              </Pressable>
            )}
            <Pressable
              onPress={handlePickImage}
              accessibilityRole="button"
              accessibilityLabel="Add photos from gallery"
              style={{
                flex: 1,
                backgroundColor: '#eee',
                justifyContent: 'center',
                alignItems: 'center',
                borderRadius: 8,
                borderWidth: 2,
                borderColor: '#ccc',
                borderStyle: 'dashed',
              }}
            >
              <Icon source="image-plus" size={48} color="#999" />
              <Text style={{ color: '#999', marginTop: 8 }}>Add Photos</Text>
            </Pressable>
          </View>
        )
      )}

      {imageCount > 1 && (
        <View style={{ marginTop: 12, paddingHorizontal: 16 }}>
          <GalleryFlatList
            ref={thumbsRef}
            data={thumbnailUrls}
            horizontal
            showsHorizontalScrollIndicator={false}
            keyExtractor={(_: any, i: number) => String(i)}
            renderItem={({ item, index }: { item: string; index: number }) => (
              <Pressable
                onPress={() => {
                  void updateCurrentIndex(index);
                  scrollToIndex(index);
                }}
                accessibilityRole="button"
                accessibilityLabel={`Select image ${index + 1}`}
                style={{
                  marginRight: 8,
                  borderRadius: 6,
                  overflow: 'hidden',
                  borderWidth: 2,
                  borderColor: selectedIndex === index ? '#2196F3' : 'transparent',
                }}
              >
                <Image source={{ uri: item }} style={{ width: 60, height: 60 }} />
              </Pressable>
            )}
          />
        </View>
      )}

      <Lightbox
        visible={lightboxOpen}
        images={largeUrls}
        startIndex={selectedIndex}
        onIndexChange={updateCurrentIndex}
        onClose={() => setLightboxOpen(false)}
      />
    </View>
  );
}

function Lightbox({
  visible,
  images,
  startIndex,
  onIndexChange,
  onClose,
}: {
  visible: boolean;
  images: string[];
  startIndex: number;
  onIndexChange: (index: number) => void;
  onClose: () => void;
}) {
  const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
  const [isZoomed, setIsZoomed] = useState(false);
  const [index, setIndex] = useState(startIndex);
  const scrollRef = useRef<any>(null);
  const targetIndexRef = useRef(startIndex);
  const dragStartIndexRef = useRef(startIndex);
  const touchStartXRef = useRef<number | null>(null);
  const isWeb = Platform.OS === 'web';
  const isTouchWeb = isWeb && typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;

  const clampIndex = useCallback(
    (nextIndex: number) => Math.max(0, Math.min(nextIndex, images.length - 1)),
    [images.length],
  );

  const scrollToIndex = useCallback(
    (nextIndex: number, animated: boolean) => {
      try {
        scrollRef.current?.scrollToIndex({ index: nextIndex, animated });
      } catch {
        scrollRef.current?.scrollToOffset({ offset: nextIndex * SCREEN_WIDTH, animated });
      }
    },
    [SCREEN_WIDTH],
  );

  const setActiveIndex = useCallback(
    (nextIndex: number, animated: boolean) => {
      const clampedIndex = clampIndex(nextIndex);
      targetIndexRef.current = clampedIndex;
      setIndex(clampedIndex);
      onIndexChange(clampedIndex);
      scrollToIndex(clampedIndex, animated);
    },
    [clampIndex, onIndexChange, scrollToIndex],
  );

  const navigateBy = useCallback(
    (delta: number, animated: boolean = true) => {
      const nextIndex = clampIndex(targetIndexRef.current + delta);
      if (nextIndex !== targetIndexRef.current) {
        setActiveIndex(nextIndex, animated);
      }
    },
    [clampIndex, setActiveIndex],
  );

  const handleClose = useCallback(() => {
    onIndexChange(targetIndexRef.current);
    onClose();
  }, [onClose, onIndexChange]);

  useEffect(() => {
    if (visible) {
      targetIndexRef.current = startIndex;
      dragStartIndexRef.current = startIndex;
      setIndex(startIndex);
      onIndexChange(startIndex);
      setIsZoomed(false);
      // Wait for layout
      const timer = setTimeout(() => {
        scrollToIndex(startIndex, false);
      }, 50);
      if (timer && typeof timer === 'object' && 'unref' in timer) {
        (timer as any).unref();
      }
      return () => clearTimeout(timer);
    }
  }, [visible, onIndexChange, scrollToIndex, startIndex]);

  // Handle keyboard on web
  useEffect(() => {
    if (!visible || !isWeb) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        navigateBy(-1);
      } else if (e.key === 'ArrowRight') {
        navigateBy(1);
      } else if (e.key === 'Escape') {
        handleClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [visible, handleClose, navigateBy, isWeb]);

  const handleScrollBeginDrag = useCallback(
    (e: any) => {
      const nextIndex = clampIndex(Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH));
      dragStartIndexRef.current = nextIndex;
      targetIndexRef.current = nextIndex;
    },
    [SCREEN_WIDTH, clampIndex],
  );

  const handleScrollEnd = useCallback(
    (e: any) => {
      const rawIndex = e.nativeEvent.contentOffset.x / SCREEN_WIDTH;
      const roundedIndex = clampIndex(Math.round(rawIndex));

      if (isWeb && !isZoomed) {
        const delta = roundedIndex - dragStartIndexRef.current;
        const limitedIndex =
          delta === 0 ? dragStartIndexRef.current : clampIndex(dragStartIndexRef.current + Math.sign(delta));

        if (limitedIndex !== targetIndexRef.current || limitedIndex !== roundedIndex) {
          setActiveIndex(limitedIndex, false);
          return;
        }
      }

      targetIndexRef.current = roundedIndex;
      setIndex(roundedIndex);
      onIndexChange(roundedIndex);
    },
    [SCREEN_WIDTH, clampIndex, isWeb, isZoomed, onIndexChange, setActiveIndex],
  );

  const handleTouchStart = useCallback(
    (e: any) => {
      if (!isTouchWeb || isZoomed) return;
      const touch = e.nativeEvent.touches?.[0] ?? e.nativeEvent.changedTouches?.[0];
      touchStartXRef.current = touch?.clientX ?? null;
    },
    [isTouchWeb, isZoomed],
  );

  const handleTouchEnd = useCallback(
    (e: any) => {
      if (!isTouchWeb || isZoomed) return;

      const startX = touchStartXRef.current;
      touchStartXRef.current = null;
      if (startX === null) return;

      const touch = e.nativeEvent.changedTouches?.[0];
      const endX = touch?.clientX;
      if (typeof endX !== 'number') return;

      const deltaX = endX - startX;
      const swipeThreshold = Math.min(80, SCREEN_WIDTH * 0.12);
      if (Math.abs(deltaX) < swipeThreshold) return;

      navigateBy(deltaX > 0 ? -1 : 1, true);
    },
    [SCREEN_WIDTH, isTouchWeb, isZoomed, navigateBy],
  );

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose} statusBarTranslucent={true}>
      <GestureHandlerRootView style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.95)' }}>
        <Pressable
          onPress={handleClose}
          hitSlop={20}
          accessibilityLabel="Close lightbox"
          style={{
            position: 'absolute',
            top: 40,
            right: 20,
            zIndex: 10,
            backgroundColor: 'rgba(0,0,0,0.5)',
            borderRadius: 20,
            width: 44,
            height: 44,
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <Icon source="close" size={28} color="white" />
        </Pressable>

        <GalleryFlatList
          ref={scrollRef}
          data={images}
          horizontal
          pagingEnabled
          disableIntervalMomentum={true}
          bounces={false}
          scrollEnabled={!isZoomed && !isTouchWeb}
          style={{ flex: 1 }}
          snapToInterval={SCREEN_WIDTH}
          snapToAlignment="center"
          decelerationRate="fast"
          showsHorizontalScrollIndicator={false}
          keyExtractor={(_: any, i: number) => String(i)}
          getItemLayout={(_: any, i: number) => ({ length: SCREEN_WIDTH, offset: SCREEN_WIDTH * i, index: i })}
          onScrollBeginDrag={handleScrollBeginDrag}
          onScrollEndDrag={handleScrollEnd}
          onMomentumScrollEnd={handleScrollEnd}
          renderItem={({ item }: { item: string }) => (
            <View
              onTouchStart={handleTouchStart}
              onTouchEnd={handleTouchEnd}
              style={{ width: SCREEN_WIDTH, height: SCREEN_HEIGHT, justifyContent: 'center', alignItems: 'center' }}
            >
              <ZoomableImage
                uri={item}
                setIsZoomed={setIsZoomed}
                onSwipe={(direction) => {
                  setIsZoomed(false);
                  navigateBy(direction);
                }}
              />
            </View>
          )}
        />

        {images.length > 1 && (
          <View style={{ position: 'absolute', bottom: 40, width: '100%', alignItems: 'center' }}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                backgroundColor: 'rgba(0,0,0,0.5)',
                borderRadius: 24,
                paddingHorizontal: 16,
                paddingVertical: 8,
              }}
            >
              <Pressable
                onPress={() => navigateBy(-1)}
                hitSlop={15}
                style={{ opacity: index === 0 ? 0.3 : 1, padding: 8 }}
                disabled={index === 0}
                accessibilityRole="button"
                accessibilityLabel="Previous image"
              >
                <Icon source="chevron-left" size={32} color="white" />
              </Pressable>

              <Text style={{ color: 'white', fontSize: 16, marginHorizontal: 20, minWidth: 60, textAlign: 'center' }}>
                {index + 1} / {images.length}
              </Text>

              <Pressable
                onPress={() => navigateBy(1)}
                hitSlop={15}
                style={{ opacity: index === images.length - 1 ? 0.3 : 1, padding: 8 }}
                disabled={index === images.length - 1}
                accessibilityRole="button"
                accessibilityLabel="Next image"
              >
                <Icon source="chevron-right" size={32} color="white" />
              </Pressable>
            </View>
          </View>
        )}
      </GestureHandlerRootView>
    </Modal>
  );
}
