import { afterAll, afterEach, beforeEach, jest } from '@jest/globals';
import { cleanup } from '@testing-library/react-native';
import type React from 'react';
import { server } from '@/test-utils/server';

process.env.EXPO_PUBLIC_API_URL = 'http://127.0.0.1:18010';

if (typeof window !== 'undefined' && typeof window.dispatchEvent !== 'function') {
  Object.defineProperty(window, 'dispatchEvent', {
    configurable: true,
    writable: true,
    value: jest.fn(() => true),
  });
}

if (typeof window !== 'undefined' && typeof window.history?.replaceState !== 'function') {
  Object.defineProperty(window, 'history', {
    configurable: true,
    writable: true,
    value: {
      replaceState: jest.fn(),
    },
  });
}

// ── MSW server lifecycle ───────────────────────────────────────────────────
// Open a fresh interceptor layer per test so worker processes don't keep
// long-lived network hooks around until suite teardown.
beforeEach(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  server.close();
  cleanup();
  jest.clearAllTimers();
});
afterAll(() => {
  cleanup();
  jest.clearAllTimers();
  jest.useRealTimers();
  server.close();
});

// Mock expo-secure-store (replaces AsyncStorage for token persistence on native)
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

// Mock AsyncStorage so tests never touch the native module implementation.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// Mock expo-linear-gradient
jest.mock('expo-linear-gradient', () => ({
  LinearGradient: 'LinearGradient',
}));

// The library's own Jest mock — its native module isn't linked under Jest, so
// any screen using AuthScreen's KeyboardAvoidingView would fail to load.
jest.mock('react-native-keyboard-controller', () =>
  require('react-native-keyboard-controller/jest'),
);

// Mock Expo Auth Session Google hook to avoid browser-session side effects in Jest.
jest.mock('expo-auth-session/providers/google', () => ({
  useAuthRequest: jest.fn(() => [null, null, jest.fn()]),
}));

function mockCreateAnimatedStyleHook() {
  return (fn: () => Record<string, unknown>) => {
    try {
      return fn();
    } catch {
      return {};
    }
  };
}

function mockCreateAnimatedPropsHook() {
  return (fn: () => Record<string, unknown>) => {
    try {
      return fn();
    } catch {
      return {};
    }
  };
}

function mockCreateSharedValue(initialValue: unknown, noopFn: jest.Mock) {
  let currentValue = initialValue;
  return {
    get value() {
      return currentValue;
    },
    set value(nextValue: unknown) {
      currentValue = nextValue;
    },
    get: () => currentValue,
    set: (nextValue: unknown) => {
      currentValue = nextValue;
    },
    modify: noopFn,
  };
}

function mockCreateAnimatedComponent() {
  const React = require('react');
  const { View, Text, Image, ScrollView } = require('react-native');
  const AnimatedComponent = ({
    children,
    style,
    ...props
  }: {
    children?: React.ReactNode;
    style?: Record<string, unknown>;
    [key: string]: unknown;
  }) => React.createElement(View, { style, ...props }, children);

  Object.assign(AnimatedComponent, {
    View,
    Text,
    Image,
    ScrollView,
    createAnimatedComponent: (c: React.ComponentType) => c,
  });

  return AnimatedComponent;
}

// Entering/exiting animation builders (FadeIn.duration(150) and friends): the
// real ones are worklet-backed classes, so the mock only has to be chainable
// and land on something a component can hold as a prop.
function mockCreateAnimationBuilder() {
  const builder: Record<string, () => unknown> = {};
  for (const method of [
    'duration',
    'delay',
    'springify',
    'easing',
    'withInitialValues',
    'reduceMotion',
    'build',
  ]) {
    builder[method] = () => builder;
  }
  return builder;
}

// Mock react-native-reanimated
// react-native-reanimated 4.x uses react-native-worklets which requires native
// initialisation; unusable in Jest. We provide a minimal inline mock instead.
jest.mock('react-native-reanimated', () => {
  const noopFn = jest.fn();
  const AnimatedComponent = mockCreateAnimatedComponent();

  return {
    FadeIn: mockCreateAnimationBuilder(),
    FadeOut: mockCreateAnimationBuilder(),
    FadeInUp: mockCreateAnimationBuilder(),
    FadeInDown: mockCreateAnimationBuilder(),
    __esModule: true,
    default: AnimatedComponent,
    useAnimatedStyle: mockCreateAnimatedStyleHook(),
    useAnimatedProps: mockCreateAnimatedPropsHook(),
    useSharedValue: (initialValue: unknown) => mockCreateSharedValue(initialValue, noopFn),
    useAnimatedSensor: () => ({
      sensor: { value: { pitch: 0, roll: 0, yaw: 0 } },
      unregister: noopFn,
    }),
    useDerivedValue: (fn: () => unknown) => ({
      value: (() => {
        try {
          return fn();
        } catch {
          return;
        }
      })(),
    }),
    useAnimatedRef: () => ({ current: null }),
    useAnimatedScrollHandler: () => () => {},
    withSpring: (value: number) => value,
    withTiming: (value: number) => value,
    withDelay: (_: number, value: number) => value,
    withRepeat: (value: number) => value,
    withSequence: (...values: number[]) => values[values.length - 1],
    interpolate: (value: number) => value,
    Extrapolation: { CLAMP: 'clamp', EXTEND: 'extend', IDENTITY: 'identity' },
    ReduceMotion: { System: 'system', Always: 'always', Never: 'never' },
    SensorType: {
      ROTATION: 'ROTATION',
      GRAVITY: 'GRAVITY',
      GYROSCOPE: 'GYROSCOPE',
    },
    runOnJS: <T extends (...args: unknown[]) => unknown>(fn: T): T => fn,
    runOnUI: <T extends (...args: unknown[]) => unknown>(fn: T): T => fn,
    cancelAnimation: noopFn,
    measure: noopFn,
    Easing: {
      linear: (t: number) => t,
      ease: (t: number) => t,
      bezier: () => (t: number) => t,
      in: (fn: (t: number) => number) => fn,
      out: (fn: (t: number) => number) => fn,
      inOut: (fn: (t: number) => number) => fn,
    },
  };
});

jest.mock('react-native-worklets', () => ({
  scheduleOnRN: (fn: (...args: unknown[]) => unknown, ...args: unknown[]) => fn(...args),
}));

// Mock expo-image (ImageBackground, Image)
jest.mock('expo-image', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    Image: (props: { [key: string]: unknown }) =>
      React.createElement(View, { testID: 'expo-image', ...props }),
    ImageBackground: (props: { children?: React.ReactNode; [key: string]: unknown }) =>
      React.createElement(View, { testID: 'expo-image-bg', ...props }, props.children),
  };
});

// Mock expo-video (used by LivePreview) to avoid importing native components
jest.mock('expo-video', () => {
  const React = require('react');
  const noop = jest.fn();
  return {
    useVideoPlayer: (
      _src: string,
      init?: (instance: { muted: boolean; loop: boolean; play: () => void }) => void,
    ) => {
      const instance = { muted: false, loop: false, play: noop };
      try {
        if (typeof init === 'function') init(instance);
      } catch {
        /* ignore */
      }
      return instance;
    },
    VideoView: (props: { [key: string]: unknown }) =>
      React.createElement('View', { testID: 'expo-video-view', ...props }),
  };
});

// Mock react-native-gesture-handler
jest.mock('react-native-gesture-handler', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    GestureHandlerRootView: ({
      children,
      style,
    }: {
      children?: React.ReactNode;
      style?: Record<string, unknown>;
    }) => React.createElement(View, { style }, children),
    GestureDetector: ({ children }: { children?: React.ReactNode }) => children,
    Gesture: {
      Tap: () => {
        const tap = {
          numberOfTaps: () => tap,
          onEnd: () => tap,
          onStart: () => tap,
        };
        return tap;
      },
      Pan: () => {
        const pan = {
          minPointers: () => pan,
          onUpdate: () => pan,
          onEnd: () => pan,
          onStart: () => pan,
          enabled: () => pan,
        };
        return pan;
      },
      Pinch: () => {
        const pinch = {
          onUpdate: () => pinch,
          onEnd: () => pinch,
          onStart: () => pinch,
        };
        return pinch;
      },
      Simultaneous: (..._args: unknown[]) => ({}),
      Exclusive: (..._args: unknown[]) => ({}),
    },
  };
});

// Allow shadow style props through react-native's Animated allowlist: some
// libraries use the native driver for shadows, which otherwise logs warnings
// under Jest.
try {
  const allowlistModuleId = [
    'react-native',
    'Libraries',
    'Animated',
    'NativeAnimatedAllowlist',
  ].join('/');
  const { allowStyleProp } = require(allowlistModuleId);
  if (typeof allowStyleProp === 'function') {
    ['shadowColor', 'shadowOffset'].forEach(allowStyleProp);
  }
} catch {
  // Path might vary by RN version; skip if not found
}

afterEach(async () => {
  const AsyncStorage = require('@react-native-async-storage/async-storage');
  await AsyncStorage.clear();
});
