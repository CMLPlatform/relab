import { describe, expect, it, jest } from '@jest/globals';
import { act, render, screen, waitFor } from '@testing-library/react-native';
import type React from 'react';
import { Text, View } from 'react-native';
import { AppStack, Providers } from '@/app/_layout';
import { HeaderRightPill } from '@/components/base/HeaderRightPill';
import { useAuth } from '@/context/auth';
import { renderWithProviders } from '@/test-utils/index';

// Populated by the Stack.Screen mock below with each screen's `name` ->
// `options`, keyed fresh on every render/rerender. 'mock'-prefixed names are
// exempt from babel-jest's hoisting TDZ check, so the factory can close over it.
const mockScreenOptions: Record<string, Record<string, unknown> | undefined> = {};

jest.mock('expo-router', () => {
  // `expo-router/react-navigation` is the lightweight compat module — unlike the
  // real `expo-router` entry point, it doesn't eagerly evaluate `ExpoRoot` (which
  // reads `window.location` and crashes outside a real router tree).
  const { DefaultTheme, DarkTheme, ThemeProvider } = jest.requireActual<
    typeof import('expo-router/react-navigation')
  >('expo-router/react-navigation');
  const ReactActual = require('react');
  function StackScreenMock({ name, options }: { name: string; options?: Record<string, unknown> }) {
    mockScreenOptions[name] = options;
    return null;
  }
  function StackMock({ children }: { children?: React.ReactNode }) {
    return ReactActual.createElement(ReactActual.Fragment, null, children);
  }
  StackMock.Screen = StackScreenMock;
  return {
    DefaultTheme,
    DarkTheme,
    ThemeProvider,
    useRouter: jest.fn(() => ({
      push: jest.fn(),
      replace: jest.fn(),
    })),
    usePathname: jest.fn(() => '/products'),
    Stack: StackMock,
  };
});

jest.mock('@/context/auth', () => ({
  useAuth: jest.fn(() => ({ user: null, refetch: jest.fn() })),
}));

jest.mock('@/context/AuthProvider', () => ({
  AuthProvider: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));

jest.mock('react-native-keyboard-controller', () => {
  const { View } = require('react-native');
  return {
    KeyboardProvider: ({ children }: { children?: React.ReactNode }) => (
      <View testID="KeyboardProvider">{children}</View>
    ),
    useKeyboardHandler: jest.fn(),
    useReanimatedKeyboardAnimation: jest.fn(() => ({
      height: { value: 0 },
      progress: { value: 0 },
    })),
  };
});

// The stack's headerRight renderer (see AppStack's products/index screen) is
// literally `() => <HeaderRightPill />`, so exercise the pill itself.
describe('HeaderRightPill', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders "Sign in" for guests', async () => {
    (useAuth as jest.Mock).mockReturnValue({ user: null });

    renderWithProviders(<HeaderRightPill />, { withAuth: true });

    await waitFor(
      () => {
        expect(screen.getByText('Sign in')).toBeOnTheScreen();
      },
      { timeout: 3000 },
    );
  });

  it('renders username for authenticated users', async () => {
    (useAuth as jest.Mock).mockReturnValue({
      user: { id: 1, username: 'testuser', email: 'test@test.com' },
    });

    renderWithProviders(<HeaderRightPill />, { withAuth: true });

    await waitFor(
      () => {
        expect(screen.getByText('testuser')).toBeOnTheScreen();
      },
      { timeout: 3000 },
    );
  });
});

describe('Providers', () => {
  it('renders children without crashing', async () => {
    renderWithProviders(
      <Providers>
        <View testID="child">
          <Text>Hello</Text>
        </View>
      </Providers>,
      { withAuth: true },
    );
    expect(screen.getByTestId('child')).toBeOnTheScreen();
    // PersistQueryClientProvider flips `isRestoring` once the persisted cache
    // read resolves — a macrotask later. Settle it here or it lands unwrapped.
    await act(async () => new Promise((resolve) => setImmediate(resolve)));
  });
});

describe('AppStack', () => {
  beforeEach(() => {
    for (const key of Object.keys(mockScreenOptions)) delete mockScreenOptions[key];
  });

  // The root stack only holds what sits outside the tabs. Every primary
  // destination — and its header — now belongs to a tab's own stack (see
  // tab-layouts.test.tsx), and the (tabs) route must not add a second header
  // above them.
  it('owns no tab screens and lets the tabs render their own headers', () => {
    render(<AppStack />);

    expect(mockScreenOptions['(tabs)']?.headerShown).toBe(false);
    expect(mockScreenOptions['products/index']).toBeUndefined();
    expect(mockScreenOptions['cameras/index']).toBeUndefined();
    expect(mockScreenOptions.account).toBeUndefined();
    // Screens presented over a tab stay here.
    expect(mockScreenOptions['category-selection']?.title).toBe('Select category');
    expect(mockScreenOptions['users/[username]']).toBeDefined();
  });
});
