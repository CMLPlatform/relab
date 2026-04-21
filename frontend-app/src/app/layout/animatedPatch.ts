import { Animated, Platform } from 'react-native';

let animatedPatchApplied = false;

function patchAnimatedTiming() {
  const originalTiming = Animated.timing;
  Object.defineProperty(Animated, 'timing', {
    value: (
      value: Parameters<typeof Animated.timing>[0],
      config: Parameters<typeof Animated.timing>[1],
    ) => originalTiming(value, { ...config, useNativeDriver: false }),
    writable: true,
    configurable: true,
  });
}

function patchAnimatedSpring() {
  const originalSpring = Animated.spring;
  Object.defineProperty(Animated, 'spring', {
    value: (
      value: Parameters<typeof Animated.spring>[0],
      config: Parameters<typeof Animated.spring>[1],
    ) => originalSpring(value, { ...config, useNativeDriver: false }),
    writable: true,
    configurable: true,
  });
}

function patchAnimatedDecay() {
  const originalDecay = Animated.decay;
  Object.defineProperty(Animated, 'decay', {
    value: (
      value: Parameters<typeof Animated.decay>[0],
      config: Parameters<typeof Animated.decay>[1],
    ) => originalDecay(value, { ...config, useNativeDriver: false }),
    writable: true,
    configurable: true,
  });
}

function patchAnimatedEvent() {
  const originalEvent = Animated.event;
  Object.defineProperty(Animated, 'event', {
    value: (...args: Parameters<typeof originalEvent>) => {
      const [argMapping, config] = args;
      return originalEvent(argMapping, { ...config, useNativeDriver: false });
    },
    writable: true,
    configurable: true,
  });
}

export function ensureWebAnimatedPatch() {
  if (Platform.OS !== 'web' || animatedPatchApplied) return;

  patchAnimatedTiming();
  patchAnimatedSpring();
  patchAnimatedDecay();
  patchAnimatedEvent();
  animatedPatchApplied = true;
}
