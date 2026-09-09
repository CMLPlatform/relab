import { Image } from 'expo-image';
import { type RefObject, useCallback, useEffect, useImperativeHandle, useState } from 'react';
import { type LayoutChangeEvent, Platform, StyleSheet, useWindowDimensions } from 'react-native';
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
import { IMAGE_FADE_MS } from '@/constants';

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
  /** Defaults to decorative (''); callers without their own labelled wrapper pass a description. */
  accessibilityLabel?: string;
  /** When false (the lightbox paged away), zoom snaps back to identity without animation. */
  active?: boolean;
  /** Keyboard zoom entry point (the lightbox binds +/-/0 to it). Attached to the active slide only. */
  zoomRef?: RefObject<ZoomableImageHandle | null>;
}

export type ZoomableImageHandle = {
  /** Steps the zoom by `step`; the result is clamped to 1..MAX_SCALE. */
  zoomBy: (step: number) => void;
  reset: () => void;
};

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: the pinch/pan/tap gesture worklets share this component's shared values and stay centralized.
export default function ZoomableImage({
  uri,
  onScaleChange,
  setIsZoomed,
  onSwipe,
  accessibilityLabel = '',
  active = true,
  zoomRef,
}: Props) {
  // Pre-layout fallback; the measured container width wins after onLayout.
  const fallbackWidth = useWindowDimensions().width;
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

  const resetZoom = useCallback(
    (animated = true) => {
      scale.set(animated ? withTiming(1, TIMING) : 1);
      translateX.set(animated ? withTiming(0, TIMING) : 0);
      translateY.set(animated ? withTiming(0, TIMING) : 0);
      savedScale.set(1);
      savedTranslateX.set(0);
      savedTranslateY.set(0);
      wasZoomed.set(false);
      scheduleOnRN(updateZoomState, 1);
    },
    [
      scale,
      savedScale,
      savedTranslateX,
      savedTranslateY,
      translateX,
      translateY,
      wasZoomed,
      updateZoomState,
    ],
  );

  // Snap, not tween: `active` flips while the pager is still sliding, so an
  // animated reset would play in view.
  useEffect(() => {
    if (!active) resetZoom(false);
  }, [active, resetZoom]);

  // NOTE: bounds use the container rect, not the drawn image rect; with contentFit="contain" a
  // letterboxed image can pan its margin into view; computing true bounds needs intrinsic image
  // dimensions from onLoad, add if it bothers anyone.
  const clampTranslationToBounds = useCallback(
    (velocityX: number, velocityY: number) => {
      'worklet';
      if (containerHeight.get() === 0) {
        // Layout not measured yet; do not clamp against a 0 rect.
        savedTranslateX.set(translateX.get());
        savedTranslateY.set(translateY.get());
        return;
      }
      // Measured width: rotation and window resizes would otherwise use a stale rect.
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
      // This gesture's own movement, not the accumulated offset, and distance
      // only: while zoomed a short flick is momentum panning, and a velocity
      // trigger would page away and discard the zoom.
      const horizontal = e.translationX;
      const vertical = e.translationY;
      const swipeThreshold = (containerWidth.get() || fallbackWidth) * 0.15;
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

  // JS-thread twin of the double-tap worklet.
  useImperativeHandle(
    zoomRef,
    () => ({
      zoomBy: (step: number) => {
        const next = clamp(scale.get() + step, 1, MAX_SCALE);
        if (next <= 1.05) {
          resetZoom();
          return;
        }
        scale.set(withTiming(next, TIMING));
        savedScale.set(next);
        wasZoomed.set(true);
        updateZoomState(next);
      },
      reset: () => resetZoom(),
    }),
    [resetZoom, savedScale, scale, updateZoomState, wasZoomed],
  );

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
      <Animated.View
        testID="zoomable-image"
        style={[styles.container, animatedStyle]}
        onLayout={handleLayout}
      >
        <Image
          accessibilityIgnoresInvertColors
          source={{ uri }}
          contentFit="contain"
          transition={IMAGE_FADE_MS}
          style={styles.image}
          accessibilityLabel={accessibilityLabel}
        />
      </Animated.View>
    </GestureDetector>
  );
}

// Animated.View and expo-image's Image are not className targets here; layout stays inline.
const styles = StyleSheet.create({
  container: {
    // Relative so the slide tracks window resizes.
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: '100%',
  },
});
