import { jest } from '@jest/globals';
import type React from 'react';

// Keep the broad Expo Router mock in the fast unit lane. Integration tests
// can then opt into expo-router/testing-library with the real router module.
jest.mock('expo-router', () => {
  const React = require('react');
  // Theme values/provider moved from @react-navigation/native to expo-router in SDK 57;
  // re-expose the real objects so theme adaptation still works under the mock.
  const { DefaultTheme, DarkTheme, ThemeProvider } = require('@react-navigation/native');
  return {
    DefaultTheme,
    DarkTheme,
    ThemeProvider,
    useRouter: jest.fn().mockReturnValue({
      push: jest.fn(),
      replace: jest.fn(),
      back: jest.fn(),
      setParams: jest.fn(),
    }),
    useSegments: () => [],
    useFocusEffect: jest.fn(),
    useLocalSearchParams: jest.fn().mockReturnValue({}),
    useGlobalSearchParams: jest.fn().mockReturnValue({}),
    useNavigation: jest.fn().mockReturnValue({
      setOptions: jest.fn(),
      canGoBack: jest.fn().mockReturnValue(false),
      goBack: jest.fn(),
    }),
    Link: ({ children }: { children: React.ReactNode }) => children,
    Redirect: ({ href }: { href: string }) => {
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
