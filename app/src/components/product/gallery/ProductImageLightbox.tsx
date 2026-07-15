import { MaterialCommunityIcons } from '@expo/vector-icons';
import {
  type Dispatch,
  memo,
  type SetStateAction,
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Dimensions,
  type GestureResponderEvent,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import ImagePlaceholder from '@/components/base/ImagePlaceholder';
import ZoomableImage from '@/components/base/ZoomableImage';
import { type AppTheme, memoizeByTheme, useAppTheme } from '@/theme';
import {
  GalleryFlatList,
  type GalleryItem,
  galleryItemKeyExtractor,
  getTouchPointX,
  makeHorizontalItemLayout,
  type ScrollableListHandle,
  type ScrollEvent,
} from './shared';

type Props = {
  visible: boolean;
  items: GalleryItem[];
  startIndex: number;
  onIndexChange: (index: number) => void;
  onClose: () => void;
};

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: the lightbox render logic is intentionally centralized for one complex modal surface.
export function ProductImageLightbox({
  visible,
  items,
  startIndex,
  onIndexChange,
  onClose,
}: Props) {
  const theme = useAppTheme();
  const styles = createStyles(theme);
  const { width: screenWidth, height: screenHeight } = Dimensions.get('window');
  const [isZoomed, setIsZoomed] = useState(false);
  const scrollRef = useRef<ScrollableListHandle | null>(null);
  const targetIndexRef = useRef(startIndex);
  const dragStartIndexRef = useRef(startIndex);
  const touchStartXRef = useRef<number | null>(null);
  const isWeb = Platform.OS === 'web';
  const isTouchWeb =
    isWeb && typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;
  const index = startIndex;

  const clampIndex = useCallback(
    (nextIndex: number) => Math.max(0, Math.min(nextIndex, items.length - 1)),
    [items.length],
  );

  const scrollToIndex = useCallback(
    (nextIndex: number, animated: boolean) => {
      try {
        scrollRef.current?.scrollToIndex({ index: nextIndex, animated });
      } catch {
        scrollRef.current?.scrollToOffset({ offset: nextIndex * screenWidth, animated });
      }
    },
    [screenWidth],
  );

  const setActiveIndex = useCallback(
    (nextIndex: number, animated: boolean) => {
      const clampedIndex = clampIndex(nextIndex);
      targetIndexRef.current = clampedIndex;
      onIndexChange(clampedIndex);
      scrollToIndex(clampedIndex, animated);
    },
    [clampIndex, onIndexChange, scrollToIndex],
  );

  // Reset zoom here rather than at each call site: `scrollEnabled` and the touch
  // handlers are gated on `isZoomed`, so a navigation that left it set (footer
  // chevron, arrow key) permanently disabled paging on the next slide.
  const navigateBy = useCallback(
    (delta: number, animated: boolean = true) => {
      const nextIndex = clampIndex(targetIndexRef.current + delta);
      if (nextIndex !== targetIndexRef.current) {
        setIsZoomed(false);
        setActiveIndex(nextIndex, animated);
      }
    },
    [clampIndex, setActiveIndex],
  );

  const handleClose = useCallback(() => {
    setIsZoomed(false);
    onIndexChange(targetIndexRef.current);
    onClose();
  }, [onClose, onIndexChange]);

  const handleWindowKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (event.key === 'ArrowLeft') {
      navigateBy(-1);
    } else if (event.key === 'ArrowRight') {
      navigateBy(1);
    } else if (event.key === 'Escape') {
      handleClose();
    }
  });

  useEffect(() => {
    if (!visible) return;
    targetIndexRef.current = startIndex;
    dragStartIndexRef.current = startIndex;
    onIndexChange(startIndex);
    const timer = setTimeout(() => {
      scrollToIndex(startIndex, false);
    }, 50);
    if (timer && typeof timer === 'object' && 'unref' in timer) {
      (timer as { unref(): void }).unref();
    }
    return () => clearTimeout(timer);
  }, [onIndexChange, scrollToIndex, startIndex, visible]);

  useEffect(() => {
    if (!(visible && isWeb)) return;
    window.addEventListener('keydown', handleWindowKeyDown);
    return () => window.removeEventListener('keydown', handleWindowKeyDown);
  }, [isWeb, visible]);

  const handleScrollBeginDrag = useCallback(
    (event: ScrollEvent) => {
      const nextIndex = clampIndex(Math.round(event.nativeEvent.contentOffset.x / screenWidth));
      dragStartIndexRef.current = nextIndex;
      targetIndexRef.current = nextIndex;
    },
    [clampIndex, screenWidth],
  );

  const handleScrollEnd = useCallback(
    (event: ScrollEvent) => {
      const rawIndex = event.nativeEvent.contentOffset.x / screenWidth;
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
      onIndexChange(roundedIndex);
    },
    [clampIndex, isWeb, isZoomed, onIndexChange, screenWidth, setActiveIndex],
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
      const swipeThreshold = Math.min(80, screenWidth * 0.12);
      if (Math.abs(deltaX) < swipeThreshold) return;
      navigateBy(deltaX > 0 ? -1 : 1, true);
    },
    [isTouchWeb, isZoomed, navigateBy, screenWidth],
  );

  const setScrollRef = useCallback((instance: ScrollableListHandle | null) => {
    scrollRef.current = instance;
  }, []);
  const getItemLayout = useMemo(() => makeHorizontalItemLayout(screenWidth), [screenWidth]);
  const renderItem = useCallback(
    ({ item }: { item: GalleryItem }) => (
      <LightboxSlide
        uri={item.largeUrl}
        styles={styles}
        screenWidth={screenWidth}
        screenHeight={screenHeight}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        setIsZoomed={setIsZoomed}
        navigateBy={navigateBy}
      />
    ),
    [styles, screenWidth, screenHeight, handleTouchStart, handleTouchEnd, navigateBy],
  );
  const goPrev = useCallback(() => navigateBy(-1), [navigateBy]);
  const goNext = useCallback(() => navigateBy(1), [navigateBy]);

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
      statusBarTranslucent={true}
    >
      <GestureHandlerRootView style={styles.root}>
        <Pressable
          onPress={handleClose}
          hitSlop={20}
          accessibilityLabel="Close lightbox"
          style={styles.closeButton}
        >
          <MaterialCommunityIcons name="close" size={28} color={theme.tokens.text.onMedia} />
        </Pressable>

        <GalleryFlatList
          ref={setScrollRef}
          testID="lightbox-pager"
          data={items}
          horizontal
          pagingEnabled
          disableIntervalMomentum={true}
          bounces={false}
          scrollEnabled={!(isZoomed || isTouchWeb)}
          style={styles.list}
          snapToInterval={screenWidth}
          snapToAlignment="center"
          decelerationRate="fast"
          showsHorizontalScrollIndicator={false}
          keyExtractor={galleryItemKeyExtractor}
          getItemLayout={getItemLayout}
          onScrollBeginDrag={handleScrollBeginDrag}
          onScrollEndDrag={handleScrollEnd}
          onMomentumScrollEnd={handleScrollEnd}
          renderItem={renderItem}
        />

        {items.length > 1 ? (
          <View style={styles.footerWrap}>
            <View style={styles.footerBar}>
              <Pressable
                onPress={goPrev}
                hitSlop={15}
                style={[styles.navButton, index === 0 && styles.navButtonDisabled]}
                disabled={index === 0}
                accessibilityRole="button"
                accessibilityLabel="Previous image"
              >
                <MaterialCommunityIcons
                  name="chevron-left"
                  size={32}
                  color={theme.tokens.text.onMedia}
                />
              </Pressable>

              <Text style={[styles.counterText, { color: theme.tokens.text.onMedia }]}>
                {index + 1} / {items.length}
              </Text>

              <Pressable
                onPress={goNext}
                hitSlop={15}
                style={[styles.navButton, index === items.length - 1 && styles.navButtonDisabled]}
                disabled={index === items.length - 1}
                accessibilityRole="button"
                accessibilityLabel="Next image"
              >
                <MaterialCommunityIcons
                  name="chevron-right"
                  size={32}
                  color={theme.tokens.text.onMedia}
                />
              </Pressable>
            </View>
          </View>
        ) : null}
      </GestureHandlerRootView>
    </Modal>
  );
}

const LightboxSlide = memo(function LightboxSlide({
  uri,
  styles,
  screenWidth,
  screenHeight,
  onTouchStart,
  onTouchEnd,
  setIsZoomed,
  navigateBy,
}: {
  uri: string | null;
  styles: ReturnType<typeof createStyles>;
  screenWidth: number;
  screenHeight: number;
  onTouchStart: (event: GestureResponderEvent) => void;
  onTouchEnd: (event: GestureResponderEvent) => void;
  setIsZoomed: Dispatch<SetStateAction<boolean>>;
  navigateBy: (delta: number, animated?: boolean) => void;
}) {
  const handleSwipe = useCallback(
    (direction: number) => {
      setIsZoomed(false);
      navigateBy(direction);
    },
    [setIsZoomed, navigateBy],
  );

  return (
    <View
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      style={[styles.slide, { width: screenWidth, height: screenHeight }]}
    >
      {uri ? (
        <ZoomableImage uri={uri} setIsZoomed={setIsZoomed} onSwipe={handleSwipe} />
      ) : (
        <ImagePlaceholder width={screenWidth} height={screenHeight} borderRadius={0} />
      )}
    </View>
  );
});

const createStyles = memoizeByTheme((theme: AppTheme) =>
  StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: theme.tokens.overlay.media,
    },
    closeButton: {
      position: 'absolute',
      top: 40,
      right: 20,
      zIndex: 10,
      backgroundColor: theme.tokens.overlay.media,
      borderRadius: 20,
      width: 44,
      height: 44,
      justifyContent: 'center',
      alignItems: 'center',
    },
    list: {
      flex: 1,
    },
    slide: {
      justifyContent: 'center',
      alignItems: 'center',
    },
    footerWrap: {
      position: 'absolute',
      bottom: 40,
      width: '100%',
      alignItems: 'center',
    },
    footerBar: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.tokens.overlay.media,
      borderRadius: 24,
      paddingHorizontal: 16,
      paddingVertical: 8,
    },
    navButton: {
      padding: 8,
    },
    navButtonDisabled: {
      opacity: 0.3,
    },
    counterText: {
      fontSize: 16,
      marginHorizontal: 20,
      minWidth: 60,
      textAlign: 'center',
    },
  }),
);
