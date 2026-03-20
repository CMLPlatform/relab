import { afterAll, afterEach, beforeAll, jest } from '@jest/globals';
import { server } from './src/test-utils/server';

process.env.EXPO_PUBLIC_API_URL = 'http://localhost:8000/api';

// ── MSW server lifecycle ───────────────────────────────────────────────────
// Start the server before all tests, reset per-test overrides after each
// test, and clean up after the full suite.
beforeAll(() => server.listen({ onUnhandledRequest: 'warn' }));
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
      ({ children }: { children: React.ReactNode }) => React.createElement(React.Fragment, null, children),
      { Screen: () => null },
    ),
  };
});

// Mock vector icons
jest.mock('@expo/vector-icons', () => ({
  MaterialCommunityIcons: 'MaterialCommunityIcons',
}));

// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// Mock expo-linear-gradient
jest.mock('expo-linear-gradient', () => ({
  LinearGradient: 'LinearGradient',
}));

// Mock react-native-reanimated
jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));

// Mock expo-image (ImageBackground, Image)
jest.mock('expo-image', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    Image: (props: any) => React.createElement(View, { testID: 'expo-image', ...props }),
    ImageBackground: (props: any) => React.createElement(View, { testID: 'expo-image-bg', ...props }, props.children),
  };
});
