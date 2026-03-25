import { Image } from 'expo-image';
import { useCallback, useState } from 'react';
import { Dimensions, Platform, StyleSheet } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface Props {
  uri: string;
  onScaleChange?: (scale: number) => void;
  setIsZoomed?: (isZoomed: boolean) => void;
  onSwipe?: (direction: -1 | 1) => void;
}

// spell-checker: ignore Zoomable
export default function ZoomableImage({ uri, onScaleChange, setIsZoomed, onSwipe }: Props) {
  const [isZoomedInternal, setIsZoomedInternal] = useState(false);

  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);

  const updateZoomState = useCallback(
    (s: number) => {
      onScaleChange?.(s);
      const zoomed = s > 1.05;
      setIsZoomed?.(zoomed);
      if (zoomed !== isZoomedInternal) {
        setIsZoomedInternal(zoomed);
      }
    },
    [onScaleChange, setIsZoomed, isZoomedInternal],
  );

  const resetZoom = useCallback(() => {
    scale.value = withTiming(1);
    translateX.value = withTiming(0);
    translateY.value = withTiming(0);
    savedScale.value = 1;
    savedTranslateX.value = 0;
    savedTranslateY.value = 0;
    runOnJS(updateZoomState)(1);
  }, [scale, savedScale, savedTranslateX, savedTranslateY, translateX, translateY, updateZoomState]);

  const pinchGesture = Gesture.Pinch()
    .onUpdate((e) => {
      scale.value = Math.max(1, savedScale.value * e.scale);
      runOnJS(updateZoomState)(scale.value);
    })
    .onEnd(() => {
      if (scale.value < 1.1) {
        resetZoom();
      } else {
        savedScale.value = scale.value;
      }
    });

  const panGesture = Gesture.Pan()
    .enabled(isZoomedInternal)
    .onUpdate((e) => {
      translateX.value = savedTranslateX.value + e.translationX;
      translateY.value = savedTranslateY.value + e.translationY;
    })
    .onEnd(() => {
      const horizontal = translateX.value;
      const vertical = translateY.value;
      const swipeThreshold = SCREEN_WIDTH * 0.15;
      if (Math.abs(horizontal) > Math.abs(vertical) && Math.abs(horizontal) > swipeThreshold && onSwipe) {
        const direction: -1 | 1 = horizontal > 0 ? -1 : 1;
        resetZoom();
        onSwipe(direction);
        return;
      }

      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    });

  const doubleTapGesture = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      if (scale.value > 1.1) {
        resetZoom();
      } else {
        scale.value = withTiming(2);
        savedScale.value = 2;
        runOnJS(updateZoomState)(2);
      }
    });

  const composedGesture = Gesture.Simultaneous(pinchGesture, panGesture, doubleTapGesture);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }, { translateY: translateY.value }, { scale: scale.value }],
  }));

  return (
    <GestureDetector
      gesture={composedGesture}
      touchAction={Platform.OS === 'web' ? (isZoomedInternal ? 'none' : 'pan-x') : undefined}
      userSelect={Platform.OS === 'web' ? 'none' : undefined}
    >
      <Animated.View style={[styles.container, animatedStyle]}>
        <Image source={{ uri }} contentFit="contain" style={styles.image} accessibilityLabel="" />
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  container: {
    width: SCREEN_WIDTH,
    height: '100%', // Use 100% to fill the Lightbox renderItem container
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: '100%',
  },
});
