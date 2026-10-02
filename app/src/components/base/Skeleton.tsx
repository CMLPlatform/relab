import { useEffect } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import Animated, {
  cancelAnimation,
  makeMutable,
  ReduceMotion,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

interface SkeletonProps {
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

const PULSE_MS = 750;

// NOTE: one pulse drives every mounted skeleton, so a list of placeholders runs one
// animation instead of one per row. It runs only while at least one skeleton is mounted.
const pulse = makeMutable(0.4);
let mounted = 0;

function startPulse() {
  pulse.value = withRepeat(
    withSequence(withTiming(1, { duration: PULSE_MS }), withTiming(0.4, { duration: PULSE_MS })),
    -1,
    false,
    undefined,
    ReduceMotion.System,
  );
}

/** Pulsing skeleton placeholder; honors reduce-motion via `ReduceMotion.System`. */
export function Skeleton({ style, testID }: SkeletonProps) {
  useEffect(() => {
    if (mounted++ === 0) startPulse();
    return () => {
      if (--mounted === 0) {
        cancelAnimation(pulse);
        pulse.value = 0.4;
      }
    };
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: pulse.value }));

  return <Animated.View testID={testID} style={[animatedStyle, style]} />;
}
