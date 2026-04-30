import { Image } from 'expo-image';
import { useCallback, useState } from 'react';
import { Dimensions, Platform, StyleSheet } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

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
    scale.set(withTiming(1));
    translateX.set(withTiming(0));
    translateY.set(withTiming(0));
    savedScale.set(1);
    savedTranslateX.set(0);
    savedTranslateY.set(0);
    scheduleOnRN(updateZoomState, 1);
  }, [
    scale,
    savedScale,
    savedTranslateX,
    savedTranslateY,
    translateX,
    translateY,
    updateZoomState,
  ]);

  const pinchGesture = Gesture.Pinch()
    .onUpdate((e) => {
      const nextScale = Math.max(1, savedScale.get() * e.scale);
      scale.set(nextScale);
      scheduleOnRN(updateZoomState, nextScale);
    })
    .onEnd(() => {
      if (scale.get() < 1.1) {
        resetZoom();
      } else {
        savedScale.set(scale.get());
      }
    });

  const panGesture = Gesture.Pan()
    .enabled(isZoomedInternal)
    .onUpdate((e) => {
      translateX.set(savedTranslateX.get() + e.translationX);
      translateY.set(savedTranslateY.get() + e.translationY);
    })
    .onEnd(() => {
      const horizontal = translateX.get();
      const vertical = translateY.get();
      const swipeThreshold = SCREEN_WIDTH * 0.15;
      if (
        Math.abs(horizontal) > Math.abs(vertical) &&
        Math.abs(horizontal) > swipeThreshold &&
        onSwipe
      ) {
        const direction: -1 | 1 = horizontal > 0 ? -1 : 1;
        resetZoom();
        scheduleOnRN(onSwipe, direction);
        return;
      }

      savedTranslateX.set(translateX.get());
      savedTranslateY.set(translateY.get());
    });

  const doubleTapGesture = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      if (scale.get() > 1.1) {
        resetZoom();
      } else {
        scale.set(withTiming(2));
        savedScale.set(2);
        scheduleOnRN(updateZoomState, 2);
      }
    });

  const composedGesture = Gesture.Simultaneous(pinchGesture, panGesture, doubleTapGesture);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.get() },
      { translateY: translateY.get() },
      { scale: scale.get() },
    ],
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
