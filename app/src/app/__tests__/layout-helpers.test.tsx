import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { renderHook, screen } from '@testing-library/react-native';
import { HeaderRightPill } from '@/components/base/HeaderRightPill';
import { renderWithProviders } from '@/test-utils/index';
import { getAppTheme } from '@/theme';
import { useBackgroundOverlayColor } from '@/utils/router/background';
import { getUsernameOnboardingRedirect } from '@/utils/router/onboarding';
import { getProductsHeaderStyle } from '@/utils/router/styles';

const mockPush = jest.fn();
const mockUseAuth = jest.fn();
const mockUsePathname = jest.fn(() => '/products');

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
  usePathname: () => mockUsePathname(),
}));

jest.mock('@/context/auth', () => ({
  useAuth: () => mockUseAuth(),
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockUseAuth.mockReturnValue({ user: null });
  mockUsePathname.mockReturnValue('/products');
});

describe('layout helpers rendering', () => {
  it('renders HeaderRightPill for guests and signed-in users', () => {
    mockUseAuth.mockReturnValueOnce({ user: null });
    const { rerender } = renderWithProviders(<HeaderRightPill />);
    expect(screen.getByText('Sign in')).toBeOnTheScreen();

    mockUseAuth.mockReturnValueOnce({
      user: { id: 'user-1', username: 'averyverylongusername', email: 'test@example.com' },
    });
    rerender(<HeaderRightPill />);

    expect(screen.getByText('averyverylongu…')).toBeOnTheScreen();
  });

  it('renders a safe prompt for signed-in users without a username', () => {
    mockUseAuth.mockReturnValueOnce({
      user: { id: 'user-1', username: null, email: 'test@example.com' },
    });
    renderWithProviders(<HeaderRightPill />);

    expect(screen.getByText('Complete profile')).toBeOnTheScreen();
  });

  it('returns dark and light product header styles', () => {
    expect(getProductsHeaderStyle(getAppTheme('light')).headerTitleStyle.color).toBeDefined();
    expect(getProductsHeaderStyle(getAppTheme('dark')).headerTitleStyle.color).toBeDefined();
    expect(getProductsHeaderStyle(getAppTheme('light')).headerStyle.backgroundColor).not.toBe(
      getProductsHeaderStyle(getAppTheme('dark')).headerStyle.backgroundColor,
    );
  });

  it('routes incomplete users to onboarding and completed users away from onboarding', () => {
    expect(
      getUsernameOnboardingRedirect({
        user: { id: 'user-1', username: null, email: 'test@example.com' } as never,
        pathname: '/products',
      }),
    ).toBe('/onboarding');
    expect(
      getUsernameOnboardingRedirect({
        user: { id: 'user-1', username: 'alice', email: 'test@example.com' } as never,
        pathname: '/onboarding',
      }),
    ).toBe('/products');
    expect(
      getUsernameOnboardingRedirect({
        user: { id: 'user-1', username: null, email: 'test@example.com' } as never,
        pathname: '/onboarding',
      }),
    ).toBeNull();
  });

  it('returns the overlay colour for normal and auth routes', () => {
    const { result, rerender } = renderHook<string, { isDark: boolean }>(
      ({ isDark }) => useBackgroundOverlayColor(isDark),
      { initialProps: { isDark: false } },
    );

    expect(result.current).toBe('rgba(242,242,242,0.95)');

    mockUsePathname.mockReturnValue('/login');
    rerender({ isDark: true });

    expect(result.current).toBe('rgba(203, 211, 216, 0.5)');
  });
});
