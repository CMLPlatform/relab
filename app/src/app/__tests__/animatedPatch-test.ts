import { beforeEach, describe, expect, it } from '@jest/globals';
import { Animated, Platform } from 'react-native';
import { ensureWebAnimatedPatch } from '@/lib/router/animatedPatch';

describe('animatedPatch', () => {
  const originalTiming = Animated.timing;
  const originalSpring = Animated.spring;
  const originalDecay = Animated.decay;
  const originalEvent = Animated.event;
  const originalPlatform = Platform.OS;

  beforeEach(() => {
    Object.defineProperty(Platform, 'OS', { value: originalPlatform, configurable: true });
    Object.defineProperty(Animated, 'timing', { value: originalTiming, configurable: true });
    Object.defineProperty(Animated, 'spring', { value: originalSpring, configurable: true });
    Object.defineProperty(Animated, 'decay', { value: originalDecay, configurable: true });
    Object.defineProperty(Animated, 'event', { value: originalEvent, configurable: true });
  });

  it('does nothing outside web', () => {
    Object.defineProperty(Platform, 'OS', { value: 'ios', configurable: true });

    ensureWebAnimatedPatch();

    expect(Animated.timing).toBe(originalTiming);
    expect(Animated.spring).toBe(originalSpring);
    expect(Animated.decay).toBe(originalDecay);
    expect(Animated.event).toBe(originalEvent);
  });
});
