// spell-checker: ignore Zoomable

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Dimensions,
  type GestureResponderEvent,
  Modal,
  Platform,
  Pressable,
  FlatList as RNFlatList,
  Text,
  View,
} from 'react-native';
import { GestureHandlerRootView, FlatList as GHFlatList } from 'react-native-gesture-handler';
import {
  ActivityIndicator,
  Button,
  Dialog,
  Icon,
  Text as PaperText,
  Portal,
} from 'react-native-paper';

import { LivePreview } from '@/components/cameras/LivePreview';
import ImagePlaceholder from '@/components/common/ImagePlaceholder';
import ZoomableImage from '@/components/common/ZoomableImage';
import { useCamerasQuery, useCaptureImageMutation } from '@/hooks/useRpiCameras';
import { useRpiIntegration } from '@/hooks/useRpiIntegration';
import { getResizedImageUrl, resolveApiMediaUrl } from '@/services/api/media';
import type { CameraReadWithStatus } from '@/services/api/rpiCamera';
import { processImage } from '@/services/media/imageProcessing';
import type { Product } from '@/types/Product';

const GalleryFlatList: typeof GHFlatList =
  Platform.OS === 'web' ? (RNFlatList as unknown as typeof GHFlatList) : GHFlatList;

type ScrollEvent = { nativeEvent: { contentOffset: { x: number } } };
type ScrollableListHandle = {
  scrollToIndex(params: {
    index: number;
    animated?: boolean | null;
    viewOffset?: number;
    viewPosition?: number;
  }): void;
  scrollToOffset(params: { offset: number; animated?: boolean | null }): void;
};

const IMAGE_HEIGHT = 300;

function getTouchPointX(event: GestureResponderEvent, type: 'start' | 'end'): number | null {
  const touch =
    type === 'start'
      ? (event.nativeEvent.touches[0] ?? event.nativeEvent.changedTouches[0])
      : event.nativeEvent.changedTouches[0];

  return touch?.pageX ?? null;
}

interface Props {
  product: Product;
  editMode: boolean;
  onImagesChange?: (images: { url: string; description: string; id?: string }[]) => void;
}

export default function ProductImageGallery({ product, editMode, onImagesChange }: Props) {
  const { width } = Dimensions.get('window');
  const isWeb = Platform.OS === 'web';
  const showCameraOption =
    Platform.OS !== 'web' ||
    (typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches);
  const images = useMemo(() => product.images ?? [], [product.images]);
  const router = useRouter();

  // ─── RPi camera capture ───────────────────────────────────────────────────
  const productId = typeof product.id === 'number' ? product.id : null;
  const { enabled: rpiEnabled } = useRpiIntegration();
  const { data: rpiCameras, isLoading: rpiCamerasLoading } = useCamerasQuery(true, {
    enabled: rpiEnabled && editMode,
  });
  const captureMutation = useCaptureImageMutation();
  const [previewCamera, setPreviewCamera] = useState<CameraReadWithStatus | null>(null);
  const [cameraPickerVisible, setCameraPickerVisible] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);

  // Show the RPi button whenever the integration is enabled (even with 0 cameras
  // or unsaved products), so users are guided to set up or save first.
  const showRpiButton = rpiEnabled;
  const hasCamerasConfigured = (rpiCameras?.length ?? 0) > 0;
  const isNewProduct = productId === null;

  const captureFromCamera = useCallback(
    (camera: CameraReadWithStatus) => {
      if (!productId) return;
      setPreviewCamera(null);
      setCameraPickerVisible(false);
      setIsCapturing(true);
      captureMutation.mutate(
        { cameraId: camera.id, productId },
        {
          onSuccess: (captured) => {
            onImagesChange?.([
              ...images,
              {
                id: captured.id,
                url: resolveApiMediaUrl(captured.url) ?? captured.url,
                thumbnailUrl: captured.thumbnailUrl
                  ? (resolveApiMediaUrl(captured.thumbnailUrl) ?? captured.thumbnailUrl)
                  : undefined,
                description: captured.description,
              },
            ]);
          },
          onError: (err) => alert(`Capture failed: ${String(err)}`),
          onSettled: () => setIsCapturing(false),
        },
      );
    },
    [productId, captureMutation, images, onImagesChange],
  );

  const handleRpiCapture = useCallback(() => {
    if (isNewProduct) {
      alert('Save this product first before capturing from an RPi camera.');
      return;
    }
    if (rpiCamerasLoading) return;
    if (!hasCamerasConfigured) {
      router.push('/cameras');
      return;
    }
    // Always show the picker dialog — it has a Manage button for camera setup
    setCameraPickerVisible(true);
  }, [isNewProduct, rpiCamerasLoading, hasCamerasConfigured, router]);

  const galleryRef = useRef<ScrollableListHandle | null>(null);
  const thumbsRef = useRef<ScrollableListHandle | null>(null);

  const [selectedIndex, setSelectedIndex] = useState(0);
  const [pendingIndex, setPendingIndex] = useState<number | null>(null);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const previousLightboxOpenRef = useRef(false);

  const imageCount = images.length;

  const thumbnailUrls = useMemo(
    () => images.map((i) => i.thumbnailUrl ?? resolveApiMediaUrl(i.url) ?? i.url),
    [images],
  );
  const mediumUrls = useMemo(
    () => images.map((i) => getResizedImageUrl(i.url, i.id, 800)),
    [images],
  );
  const largeUrls = useMemo(
    () => images.map((i) => getResizedImageUrl(i.url, i.id, 1600)),
    [images],
  );

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

  // Pre-fetch medium-resolution images for smooth gallery scrolling
  useEffect(() => {
    for (const url of mediumUrls) {
      Image.prefetch(url);
    }
  }, [mediumUrls]);

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
        <ImagePlaceholder
          width={width}
          height={IMAGE_HEIGHT}
          label={product.name}
          testID="image-placeholder"
        />
      </View>
    );
  }

  return (
    <View style={{ marginBottom: 16 }}>
      {imageCount > 0 ? (
        <View style={{ position: 'relative' }}>
          <GalleryFlatList
            ref={(instance: ScrollableListHandle | null) => {
              galleryRef.current = instance;
            }}
            data={mediumUrls}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            keyExtractor={(_: string, i: number) => String(i)}
            getItemLayout={(_data: ArrayLike<string> | null | undefined, index: number) => ({
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
                <Image
                  source={{ uri: item }}
                  contentFit="cover"
                  style={{ width, height: IMAGE_HEIGHT }}
                />
              </Pressable>
            )}
            onMomentumScrollEnd={(e: ScrollEvent) => {
              const idx = Math.round(e.nativeEvent.contentOffset.x / width);
              void updateCurrentIndex(idx);
            }}
            onScrollEndDrag={(e: ScrollEvent) => {
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
              <View
                style={{ position: 'absolute', top: 12, left: 12, flexDirection: 'row', gap: 8 }}
              >
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
                {showRpiButton && (
                  <Pressable
                    onPress={handleRpiCapture}
                    disabled={isCapturing || rpiCamerasLoading}
                    accessibilityLabel={
                      hasCamerasConfigured ? 'Capture from RPi camera' : 'Set up RPi camera'
                    }
                    style={{
                      backgroundColor: 'rgba(0,0,0,0.45)',
                      width: 36,
                      height: 36,
                      borderRadius: 18,
                      justifyContent: 'center',
                      alignItems: 'center',
                      opacity: isCapturing || rpiCamerasLoading ? 0.5 : 1,
                    }}
                  >
                    {isCapturing || rpiCamerasLoading ? (
                      <ActivityIndicator size={18} color="white" />
                    ) : (
                      <Icon source="camera-wireless" size={20} color="white" />
                    )}
                  </Pressable>
                )}
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
            {showRpiButton && (
              <Pressable
                onPress={handleRpiCapture}
                disabled={isCapturing || rpiCamerasLoading}
                accessibilityRole="button"
                accessibilityLabel={
                  hasCamerasConfigured ? 'Capture from RPi camera' : 'Set up RPi camera'
                }
                style={{
                  flex: 1,
                  backgroundColor: '#eee',
                  justifyContent: 'center',
                  alignItems: 'center',
                  borderRadius: 8,
                  borderWidth: 2,
                  borderColor: '#ccc',
                  borderStyle: 'dashed',
                  opacity: isCapturing || rpiCamerasLoading ? 0.5 : 1,
                }}
              >
                {isCapturing || rpiCamerasLoading ? (
                  <ActivityIndicator size={32} />
                ) : (
                  <Icon source="camera-wireless" size={48} color="#999" />
                )}
                <Text style={{ color: '#999', marginTop: 8 }}>
                  {hasCamerasConfigured ? 'RPi Camera' : 'Connect Camera'}
                </Text>
              </Pressable>
            )}
          </View>
        )
      )}

      <Portal>
        {/* Camera picker — shown when user has multiple cameras */}
        <Dialog visible={cameraPickerVisible} onDismiss={() => setCameraPickerVisible(false)}>
          <Dialog.Title>Select camera</Dialog.Title>
          <Dialog.Content style={{ gap: 8 }}>
            {(() => {
              const sorted = [...(rpiCameras ?? [])].sort((a, b) => {
                const aOnline = a.status?.connection === 'online' ? 0 : 1;
                const bOnline = b.status?.connection === 'online' ? 0 : 1;
                return aOnline - bOnline;
              });
              if (sorted.length === 0) {
                return (
                  <View style={{ padding: 16, alignItems: 'center', gap: 8 }}>
                    <Icon source="camera-off" size={32} color="#999" />
                    <PaperText style={{ color: '#999', textAlign: 'center' }}>
                      No cameras registered
                    </PaperText>
                  </View>
                );
              }
              return sorted.map((cam) => {
                const isOnline = cam.status?.connection === 'online';
                return (
                  <Pressable
                    key={cam.id}
                    onPress={() => {
                      if (!isOnline) return;
                      setCameraPickerVisible(false);
                      setPreviewCamera(cam);
                    }}
                    accessibilityRole="button"
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 12,
                      padding: 12,
                      borderRadius: 8,
                      borderWidth: 1,
                      borderColor: '#e0e0e0',
                      opacity: isOnline ? 1 : 0.4,
                    }}
                  >
                    <View
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: 4,
                        backgroundColor: isOnline ? '#2e7d32' : '#999',
                      }}
                    />
                    <Icon source="access-point" size={20} />
                    <PaperText style={{ flex: 1 }}>{cam.name}</PaperText>
                    {!isOnline && (
                      <PaperText variant="labelSmall" style={{ color: '#999' }}>
                        Offline
                      </PaperText>
                    )}
                  </Pressable>
                );
              });
            })()}
          </Dialog.Content>
          <Dialog.Actions>
            <Button
              onPress={() => {
                setCameraPickerVisible(false);
                router.push('/cameras');
              }}
              icon="cog"
              compact
            >
              Manage
            </Button>
            <View style={{ flex: 1 }} />
            <Button onPress={() => setCameraPickerVisible(false)}>Cancel</Button>
          </Dialog.Actions>
        </Dialog>

        {/* Preview modal — shown after a camera is selected */}
        <Dialog
          visible={previewCamera !== null}
          onDismiss={() => setPreviewCamera(null)}
          style={{ maxWidth: 600, alignSelf: 'center', width: '100%' }}
        >
          <Dialog.Title>{previewCamera?.name ?? 'Camera preview'}</Dialog.Title>
          <Dialog.Content style={{ alignItems: 'center', gap: 12 }}>
            <LivePreview camera={previewCamera} enabled={previewCamera !== null} />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setPreviewCamera(null)}>Cancel</Button>
            <Button
              mode="contained"
              disabled={isCapturing}
              loading={isCapturing}
              onPress={() => previewCamera && captureFromCamera(previewCamera)}
            >
              Capture
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>

      {imageCount > 1 && (
        <View style={{ marginTop: 12, paddingHorizontal: 16 }}>
          <GalleryFlatList
            ref={(instance: ScrollableListHandle | null) => {
              thumbsRef.current = instance;
            }}
            data={thumbnailUrls}
            horizontal
            showsHorizontalScrollIndicator={false}
            keyExtractor={(_: string, i: number) => String(i)}
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
  const scrollRef = useRef<ScrollableListHandle | null>(null);
  const targetIndexRef = useRef(startIndex);
  const dragStartIndexRef = useRef(startIndex);
  const touchStartXRef = useRef<number | null>(null);
  const isWeb = Platform.OS === 'web';
  const isTouchWeb =
    isWeb && typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;

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
        (timer as { unref(): void }).unref();
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
    (e: ScrollEvent) => {
      const nextIndex = clampIndex(Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH));
      dragStartIndexRef.current = nextIndex;
      targetIndexRef.current = nextIndex;
    },
    [SCREEN_WIDTH, clampIndex],
  );

  const handleScrollEnd = useCallback(
    (e: ScrollEvent) => {
      const rawIndex = e.nativeEvent.contentOffset.x / SCREEN_WIDTH;
      const roundedIndex = clampIndex(Math.round(rawIndex));

      if (isWeb && !isZoomed) {
        const delta = roundedIndex - dragStartIndexRef.current;
        const limitedIndex =
          delta === 0
            ? dragStartIndexRef.current
            : clampIndex(dragStartIndexRef.current + Math.sign(delta));

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
    (event: GestureResponderEvent) => {
      if (!isTouchWeb || isZoomed) return;
      touchStartXRef.current = getTouchPointX(event, 'start');
    },
    [isTouchWeb, isZoomed],
  );

  const handleTouchEnd = useCallback(
    (event: GestureResponderEvent) => {
      if (!isTouchWeb || isZoomed) return;

      const startX = touchStartXRef.current;
      touchStartXRef.current = null;
      if (startX === null) return;

      const endX = getTouchPointX(event, 'end');
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
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
      statusBarTranslucent={true}
    >
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
          ref={(instance: ScrollableListHandle | null) => {
            scrollRef.current = instance;
          }}
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
          keyExtractor={(_: string, i: number) => String(i)}
          getItemLayout={(_data: ArrayLike<string> | null | undefined, i: number) => ({
            length: SCREEN_WIDTH,
            offset: SCREEN_WIDTH * i,
            index: i,
          })}
          onScrollBeginDrag={handleScrollBeginDrag}
          onScrollEndDrag={handleScrollEnd}
          onMomentumScrollEnd={handleScrollEnd}
          renderItem={({ item }: { item: string }) => (
            <View
              onTouchStart={handleTouchStart}
              onTouchEnd={handleTouchEnd}
              style={{
                width: SCREEN_WIDTH,
                height: SCREEN_HEIGHT,
                justifyContent: 'center',
                alignItems: 'center',
              }}
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

              <Text
                style={{
                  color: 'white',
                  fontSize: 16,
                  marginHorizontal: 20,
                  minWidth: 60,
                  textAlign: 'center',
                }}
              >
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
