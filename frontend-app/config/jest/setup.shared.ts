import { afterAll, afterEach, beforeAll, jest } from '@jest/globals';
import type React from 'react';
import { server } from '../../src/test-utils/server';

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
beforeAll(() => server.listen({ onUnhandledRequest: 'warn' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
afterEach(() => {
  jest.clearAllTimers();
});

// Mock vector icons as static functional components to avoid act() warnings
// from any internal effects or async font loading.
jest.mock('@expo/vector-icons', () => {
  const React = require('react');
  const { Text } = require('react-native');
  const MockIcon = ({
    name,
    testID,
    ...props
  }: {
    name: string;
    testID?: string;
    [key: string]: unknown;
  }) => React.createElement(Text, { testID: testID ?? `icon-${name}`, ...props }, name);

  return {
    MaterialCommunityIcons: MockIcon,
    MaterialIcons: MockIcon,
    Ionicons: MockIcon,
    FontAwesome: MockIcon,
    Feather: MockIcon,
    // Mock the factory functions
    createIconSet: () => MockIcon,
    createIconSetFromIcoMoon: () => MockIcon,
  };
});

// Also mock common subpaths that libraries might import from directly
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => ({
  default:
    jest.requireMock<typeof import('@expo/vector-icons')>('@expo/vector-icons')
      .MaterialCommunityIcons,
}));
jest.mock('@expo/vector-icons/MaterialIcons', () => ({
  default:
    jest.requireMock<typeof import('@expo/vector-icons')>('@expo/vector-icons').MaterialIcons,
}));

// Mock react-native-paper Icon to a stable component to avoid act() warnings
jest.mock('react-native-paper', () => {
  const React = require('react');
  const actual = jest.requireActual<typeof import('react-native-paper')>(
    'react-native-paper',
  ) as Record<string, unknown>;
  const { Pressable, Text, View } = require('react-native');

  const Icon = React.memo(
    ({
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
        { testID: testID ?? 'mock-icon', ...props },
        typeof source === 'string' ? source : (name ?? 'icon'),
      ),
  );

  const Menu = ({
    anchor,
    children,
    visible,
  }: {
    anchor?: React.ReactNode;
    children?: React.ReactNode;
    visible?: boolean;
  }) =>
    React.createElement(
      React.Fragment,
      null,
      anchor,
      visible ? React.createElement(View, { testID: 'mock-menu' }, children) : null,
    );

  Menu.Item = ({
    title,
    onPress,
    accessibilityLabel,
    testID,
  }: {
    title: string;
    onPress?: () => void;
    accessibilityLabel?: string;
    testID?: string;
  }) =>
    React.createElement(
      Pressable,
      {
        accessibilityRole: 'button',
        accessibilityLabel: accessibilityLabel ?? title,
        onPress,
        testID,
      },
      React.createElement(Text, null, title),
    );

  return { ...actual, Icon, Menu };
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

// Mock react-native-reanimated
// react-native-reanimated 4.x uses react-native-worklets which requires native
// initialisation; unusable in Jest. We provide a minimal inline mock instead.
jest.mock('react-native-reanimated', () => {
  const noopFn = jest.fn();
  const AnimatedComponent = mockCreateAnimatedComponent();

  return {
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

// Re-enable native animated helper to avoid file-not-found errors, but we might
// Mock Animated from react-native to handle shadowOffset errors.
// Some libraries (like react-native-paper) use native driver for shadows,
// which triggers warnings in Jest. We allow these properties globally.
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
