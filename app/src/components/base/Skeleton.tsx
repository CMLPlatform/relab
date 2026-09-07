import { useEffect } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import Animated, {
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

interface SkeletonProps {
  style?: StyleProp<ViewStyle>;
  duration?: number;
  testID?: string;
}

/** Pulsing skeleton placeholder; honors reduce-motion via `ReduceMotion.System`. */
export function Skeleton({ style, duration = 750, testID }: SkeletonProps) {
  const opacity = useSharedValue(0.4);

  useEffect(() => {
    opacity.value = withRepeat(
      withSequence(withTiming(1, { duration }), withTiming(0.4, { duration })),
      -1,
      false,
      undefined,
      ReduceMotion.System,
    );
  }, [opacity, duration]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return <Animated.View testID={testID} style={[animatedStyle, style]} />;
}
