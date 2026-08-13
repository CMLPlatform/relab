import { jest } from '@jest/globals';
import type React from 'react';

// Keep the broad Expo Router mock in the fast unit lane. Integration tests
// can then opt into expo-router/testing-library with the real router module.
jest.mock('expo-router', () => {
  const React = require('react');
  // Theme values/provider live on expo-router itself since SDK 57. Pull them from
  // the lightweight `expo-router/react-navigation` compat module rather than the
  // real `expo-router` entry point — that entry eagerly evaluates `ExpoRoot`,
  // which reads `window.location` and crashes outside a real router tree.
  const { DefaultTheme, DarkTheme, ThemeProvider } = jest.requireActual<
    typeof import('expo-router/react-navigation')
  >('expo-router/react-navigation');
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
    // Defaults to segments matching no group, so useBottomNavVisible() reads
    // false unless a test opts in with its own expo-router mock (as
    // BottomNav.test.tsx and ActiveStreamBanner's do).
    useSegments: () => [],
    useFocusEffect: jest.fn(),
    useIsFocused: jest.fn().mockReturnValue(true),
    useLocalSearchParams: jest.fn().mockReturnValue({}),
    useGlobalSearchParams: jest.fn().mockReturnValue({}),
    usePathname: jest.fn().mockReturnValue('/'),
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
  };
});

// The tabs navigator lives on its own entry point since SDK 57 (the `Tabs`
// re-export from `expo-router` is deprecated). Same shim shape as Stack's.
jest.mock('expo-router/js-tabs', () => {
  const React = require('react');
  return {
    Tabs: Object.assign(
      ({ children }: { children: React.ReactNode }) =>
        React.createElement(React.Fragment, null, children),
      { Screen: () => null },
    ),
  };
});
