import { afterAll, afterEach, beforeAll, jest } from '@jest/globals';
import type React from 'react';
import { server } from './src/test-utils/server';

process.env.EXPO_PUBLIC_API_URL = 'http://localhost:8000/api';

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
// Start the server before all tests, reset per-test overrides after each
// test, and clean up after the full suite.
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

// Mock Expo Router
jest.mock('expo-router', () => {
  const React = require('react');
  return {
    useRouter: jest.fn().mockReturnValue({
      push: jest.fn(),
      replace: jest.fn(),
      back: jest.fn(),
      setParams: jest.fn(),
    }),
    useSegments: () => [],
    useLocalSearchParams: jest.fn().mockReturnValue({}),
    useNavigation: jest.fn().mockReturnValue({
      setOptions: jest.fn(),
      canGoBack: jest.fn().mockReturnValue(false),
      goBack: jest.fn(),
    }),
    Link: ({ children }: { children: React.ReactNode }) => children,
    Redirect: ({ href }: { href: string }) => {
      // Return a simple text element that encodes the href so we can assert on it
      const { Text } = require('react-native');
      return React.createElement(Text, null, `Redirect to ${href}`);
    },
    Tabs: Object.assign(
      ({ children }: { children: React.ReactNode }) =>
        React.createElement(React.Fragment, null, children),
      { Screen: () => null },
    ),
  };
});

// Mock vector icons
jest.mock('@expo/vector-icons', () => ({
  MaterialCommunityIcons: 'MaterialCommunityIcons',
}));

// Mock react-native-paper Icon to a stable component to avoid act() warnings
jest.mock('react-native-paper', () => {
  const React = require('react');
  const actual = jest.requireActual<typeof import('react-native-paper')>(
    'react-native-paper',
  ) as Record<string, unknown>;
  const { Text } = require('react-native');

  const Icon = ({
    source,
    name,
    testID,
    ...props
  }: {
    source?: string;
    name?: string;
    testID?: string;
    [key: string]: unknown;
  }) =>
    React.createElement(
      Text,
      { testID: testID || 'mock-icon', ...props },
      source || name || 'icon',
    );

  return { ...actual, Icon };
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

// Mock Expo Auth Session Google hook to avoid browser-session side effects in Jest.
jest.mock('expo-auth-session/providers/google', () => ({
  useAuthRequest: jest.fn(() => [null, null, jest.fn()]),
}));

// Mock react-native-reanimated
// react-native-reanimated 4.x uses react-native-worklets which requires native
// initialisation; unusable in Jest. We provide a minimal inline mock instead.
jest.mock('react-native-reanimated', () => {
  const React = require('react');
  const { View, Text, Image, ScrollView } = require('react-native');
  const noopFn = jest.fn();

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

  return {
    __esModule: true,
    default: AnimatedComponent,
    useAnimatedStyle: (fn: () => Record<string, unknown>) => {
      try {
        return fn();
      } catch {
        return {};
      }
    },
    useAnimatedProps: (fn: () => Record<string, unknown>) => {
      try {
        return fn();
      } catch {
        return {};
      }
    },
    useSharedValue: (value: unknown) => ({ value, modify: noopFn }),
    useAnimatedSensor: () => ({
      sensor: { value: { pitch: 0, roll: 0, yaw: 0 } },
      unregister: noopFn,
    }),
    useDerivedValue: (fn: () => unknown) => ({
      value: (() => {
        try {
          return fn();
        } catch {
          return undefined;
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

afterEach(async () => {
  const AsyncStorage = require('@react-native-async-storage/async-storage');
  await AsyncStorage.clear();
});
