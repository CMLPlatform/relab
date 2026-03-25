import { describe, expect, it, jest } from '@jest/globals';
import { screen, waitFor } from '@testing-library/react-native';
import { Text, View } from 'react-native';
import { HeaderRight, Providers } from '../_layout';

import { useAuth } from '@/context/AuthProvider';
import { renderWithProviders } from '@/test-utils';

jest.mock('expo-router', () => ({
  useRouter: jest.fn(() => ({
    push: jest.fn(),
    replace: jest.fn(),
  })),
  usePathname: jest.fn(() => '/products'),
}));

jest.mock('@/context/AuthProvider', () => ({
  useAuth: jest.fn(() => ({ user: null, refetch: jest.fn() })),
  AuthProvider: ({ children }: any) => <>{children}</>,
}));

jest.mock('react-native-keyboard-controller', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { View } = require('react-native');
  return {
    KeyboardProvider: ({ children }: any) => <View testID="KeyboardProvider">{children}</View>,
    useKeyboardHandler: jest.fn(),
    useReanimatedKeyboardAnimation: jest.fn(() => ({ height: { value: 0 }, progress: { value: 0 } })),
  };
});

describe('HeaderRight', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders "Sign In" for guests', async () => {
    (useAuth as jest.Mock).mockReturnValue({ user: null });

    renderWithProviders(<HeaderRight />, { withAuth: true });

    await waitFor(
      () => {
        expect(screen.getByText('Sign In')).toBeTruthy();
      },
      { timeout: 3000 },
    );
  });

  it('renders username for authenticated users', async () => {
    (useAuth as jest.Mock).mockReturnValue({
      user: { id: 1, username: 'testuser', email: 'test@test.com' },
    });

    renderWithProviders(<HeaderRight />, { withAuth: true });

    await waitFor(
      () => {
        expect(screen.getByText('testuser')).toBeTruthy();
      },
      { timeout: 3000 },
    );
  });
});

describe('Providers', () => {
  it('renders children without crashing', () => {
    renderWithProviders(
      <Providers>
        <View testID="child">
          <Text>Hello</Text>
        </View>
      </Providers>,
      { withAuth: true },
    );
    expect(screen.getByTestId('child')).toBeTruthy();
  });
});
