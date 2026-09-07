import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { renderHook, screen } from '@testing-library/react-native';
import { HeaderRightPill } from '@/components/base/HeaderRightPill';
import { renderWithProviders } from '@/test-utils/index';
import { getAppTheme } from '@/theme';
import { type BackgroundOverlay, useBackgroundOverlay } from '@/utils/router/background';
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

  // Reads the values from the tokens rather than restating them: hardcoded
  // rgba literals here just break whenever the scrim is retuned.
  it('returns the overlay for normal and auth routes', () => {
    const light = getAppTheme('light').tokens.overlay;
    const dark = getAppTheme('dark').tokens.overlay;
    const { result, rerender } = renderHook<BackgroundOverlay, { isDark: boolean }>(
      ({ isDark }) => useBackgroundOverlay(isDark),
      { initialProps: { isDark: false } },
    );

    expect(result.current).toEqual({ color: light.page, edgeColor: null });

    mockUsePathname.mockReturnValue('/login');
    rerender({ isDark: true });

    // /login is a band route: gradient, not the flat hero scrim.
    expect(result.current).toEqual({ color: dark.heroBand, edgeColor: dark.heroEdge });
  });
});
