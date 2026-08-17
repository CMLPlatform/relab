import { Image } from 'expo-image';
import { useCallback, useEffect, useState } from 'react';
import { Dimensions, type LayoutChangeEvent, Platform, StyleSheet } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  clamp,
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// NOTE: hard clamp at both ends; rubber-band resistance if the stops ever feel abrupt.
const MAX_SCALE = 4;

const TIMING = {
  duration: 220,
  easing: Easing.out(Easing.quad),
  reduceMotion: ReduceMotion.System,
} as const;

interface Props {
  uri: string;
  onScaleChange?: (scale: number) => void;
  setIsZoomed?: (isZoomed: boolean) => void;
  onSwipe?: (direction: -1 | 1) => void;
  /** WCAG 1.1.1 — defaults to decorative ('') only because most callers wrap
   * this in their own labelled control; the lightbox (which doesn't) passes
   * a real description. */
  accessibilityLabel?: string;
  /**
   * When flipped false (the lightbox paged away from this slide), zoom state
   * snaps back to identity without animation — otherwise a slide zoomed by
   * pinch and left via chevron keeps its scale and comes back still zoomed
   * while the pager thinks nothing is.
   */
  active?: boolean;
}

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: the pinch/pan/tap gesture worklets share this component's shared values and stay centralized.
export default function ZoomableImage({
  uri,
  onScaleChange,
  setIsZoomed,
  onSwipe,
  accessibilityLabel = '',
  active = true,
}: Props) {
  const [isZoomedInternal, setIsZoomedInternal] = useState(false);

  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);
  const containerWidth = useSharedValue(0);
  const containerHeight = useSharedValue(0);
  const wasZoomed = useSharedValue(false);

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
    scale.set(withTiming(1, TIMING));
    translateX.set(withTiming(0, TIMING));
    translateY.set(withTiming(0, TIMING));
    savedScale.set(1);
    savedTranslateX.set(0);
    savedTranslateY.set(0);
    wasZoomed.set(false);
    scheduleOnRN(updateZoomState, 1);
  }, [
    scale,
    savedScale,
    savedTranslateX,
    savedTranslateY,
    translateX,
    translateY,
    wasZoomed,
    updateZoomState,
  ]);

  // Paged away while zoomed: the tween runs off-screen (effectively a snap) and
  // resetZoom's callback re-syncs both the internal flag and the parent's.
  useEffect(() => {
    if (!active) resetZoom();
  }, [active, resetZoom]);

  // NOTE: bounds use the container rect, not the drawn image rect — with contentFit="contain" a
  // letterboxed image can pan its margin into view; computing true bounds needs intrinsic image
  // dimensions from onLoad, add if it bothers anyone.
  const clampTranslationToBounds = useCallback(
    (velocityX: number, velocityY: number) => {
      'worklet';
      if (containerHeight.get() === 0) {
        // Layout not measured yet — keep the raw offset rather than clamping against a 0 rect.
        savedTranslateX.set(translateX.get());
        savedTranslateY.set(translateY.get());
        return;
      }
      // Measured width, not the module-load SCREEN_WIDTH — rotation and web
      // window resizes would otherwise clamp against a stale rect.
      const maxX = (containerWidth.get() * (scale.get() - 1)) / 2;
      const maxY = (containerHeight.get() * (scale.get() - 1)) / 2;
      const clampedX = clamp(translateX.get(), -maxX, maxX);
      const clampedY = clamp(translateY.get(), -maxY, maxY);
      const spring = { duration: 400, dampingRatio: 0.85, reduceMotion: ReduceMotion.System };
      translateX.set(withSpring(clampedX, { ...spring, velocity: velocityX }));
      translateY.set(withSpring(clampedY, { ...spring, velocity: velocityY }));
      savedTranslateX.set(clampedX);
      savedTranslateY.set(clampedY);
    },
    [
      containerWidth,
      containerHeight,
      scale,
      translateX,
      translateY,
      savedTranslateX,
      savedTranslateY,
    ],
  );

  const pinchGesture = Gesture.Pinch()
    .onUpdate((e) => {
      const nextScale = Math.min(MAX_SCALE, Math.max(1, savedScale.get() * e.scale));
      scale.set(nextScale);
      const zoomed = nextScale > 1.05;
      if (zoomed !== wasZoomed.get()) {
        wasZoomed.set(zoomed);
        scheduleOnRN(updateZoomState, nextScale);
      }
    })
    .onEnd(() => {
      if (scale.get() < 1.1) {
        resetZoom();
      } else {
        savedScale.set(scale.get());
        // Zooming out while panned can strand the image outside the new legal rect.
        clampTranslationToBounds(0, 0);
        // The onUpdate throttle only reports 1.05-boundary crossings; deliver
        // the settled magnitude so onScaleChange consumers see the real scale.
        scheduleOnRN(updateZoomState, scale.get());
      }
    });

  const panGesture = Gesture.Pan()
    .enabled(isZoomedInternal)
    .onUpdate((e) => {
      translateX.set(savedTranslateX.get() + e.translationX);
      translateY.set(savedTranslateY.get() + e.translationY);
    })
    .onEnd((e) => {
      // This gesture's own movement, not the accumulated offset — otherwise panning a
      // zoomed image far enough to see its edges reads as a navigation swipe.
      // Distance-only on purpose: pan runs only while zoomed, where a quick
      // short flick is momentum panning, not a navigation gesture — a velocity
      // trigger here pages away and discards the user's zoom mid-inspection.
      // Unzoomed paging is the list's native scroll, already velocity-driven.
      const horizontal = e.translationX;
      const vertical = e.translationY;
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

      clampTranslationToBounds(e.velocityX, e.velocityY);
    });

  const doubleTapGesture = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      if (scale.get() > 1.1) {
        resetZoom();
      } else {
        scale.set(withTiming(2, TIMING));
        savedScale.set(2);
        wasZoomed.set(true);
        scheduleOnRN(updateZoomState, 2);
      }
    });

  const composedGesture = Gesture.Simultaneous(pinchGesture, panGesture, doubleTapGesture);

  const handleLayout = useCallback(
    (e: LayoutChangeEvent) => {
      containerWidth.set(e.nativeEvent.layout.width);
      containerHeight.set(e.nativeEvent.layout.height);
    },
    [containerWidth, containerHeight],
  );

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
      <Animated.View style={[styles.container, animatedStyle]} onLayout={handleLayout}>
        <Image
          source={{ uri }}
          contentFit="contain"
          style={styles.image}
          accessibilityLabel={accessibilityLabel}
        />
      </Animated.View>
    </GestureDetector>
  );
}

// Neither host here is a NativeWind className target: Animated.View (from
// react-native-reanimated) and expo-image's Image aren't cssInterop-wrapped
// in this app, unlike the core RN View/Text/Pressable. Layout stays inline.
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
