import { Animated, Platform } from 'react-native';

let animatedPatchApplied = false;

// ponytail: web has no native driver; force useNativeDriver:false on each Animated entry point.
const VALUE_CONFIG_METHODS = ['timing', 'spring', 'decay'] as const;

export function ensureWebAnimatedPatch() {
  if (Platform.OS !== 'web' || animatedPatchApplied) return;

  for (const name of VALUE_CONFIG_METHODS) {
    const original = Animated[name] as (value: unknown, config: object) => unknown;
    Object.defineProperty(Animated, name, {
      value: (value: unknown, config: object) =>
        original(value, { ...config, useNativeDriver: false }),
      writable: true,
      configurable: true,
    });
  }

  // `event` takes (argMapping, config) rather than (value, config), so patch it separately.
  const originalEvent = Animated.event;
  Object.defineProperty(Animated, 'event', {
    value: (...args: Parameters<typeof originalEvent>) =>
      originalEvent(args[0], { ...args[1], useNativeDriver: false }),
    writable: true,
    configurable: true,
  });

  animatedPatchApplied = true;
}
