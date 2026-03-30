import { useEffect, useRef } from 'react';
import { Animated, Platform, type StyleProp, type ViewStyle } from 'react-native';

interface SkeletonProps {
  style?: StyleProp<ViewStyle>;
  duration?: number;
}

/**
 * Animated skeleton placeholder with a pulsing opacity effect.
 */
export function Skeleton({ style, duration = 750 }: SkeletonProps) {
  const opacity = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 1,
          duration,
          useNativeDriver: Platform.OS !== 'web',
        }),
        Animated.timing(opacity, {
          toValue: 0.4,
          duration,
          useNativeDriver: Platform.OS !== 'web',
        }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [opacity, duration]);

  return <Animated.View style={[{ opacity }, style]} />;
}
