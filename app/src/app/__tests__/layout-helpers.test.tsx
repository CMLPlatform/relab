import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { renderHook, screen } from '@testing-library/react-native';
import { Animated, Platform } from 'react-native';
import { HeaderRightPill } from '@/components/base/HeaderRightPill';
import { renderWithProviders } from '@/test-utils/index';
import { getAppTheme } from '@/theme';
import { ensureWebAnimatedPatch } from '@/utils/router/animatedPatch';
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

const originalTiming = Animated.timing;
const originalSpring = Animated.spring;
const originalDecay = Animated.decay;
const originalEvent = Animated.event;
const originalPlatform = Platform.OS;

beforeEach(() => {
  jest.clearAllMocks();
  Object.defineProperty(Platform, 'OS', { value: originalPlatform, configurable: true });
  Object.defineProperty(Animated, 'timing', { value: originalTiming, configurable: true });
  Object.defineProperty(Animated, 'spring', { value: originalSpring, configurable: true });
  Object.defineProperty(Animated, 'decay', { value: originalDecay, configurable: true });
  Object.defineProperty(Animated, 'event', { value: originalEvent, configurable: true });
  mockUseAuth.mockReturnValue({ user: null });
  mockUsePathname.mockReturnValue('/products');
});

describe('layout helpers animated behavior', () => {
  it('patches Animated on web and remains idempotent', () => {
    const timingSpy = jest.fn();
    const springSpy = jest.fn();
    const decaySpy = jest.fn();
    const eventSpy = jest.fn();
    Object.defineProperty(Animated, 'timing', { value: timingSpy, configurable: true });
    Object.defineProperty(Animated, 'spring', { value: springSpy, configurable: true });
    Object.defineProperty(Animated, 'decay', { value: decaySpy, configurable: true });
    Object.defineProperty(Animated, 'event', { value: eventSpy, configurable: true });
    Object.defineProperty(Platform, 'OS', { value: 'web', configurable: true });

    ensureWebAnimatedPatch();
    ensureWebAnimatedPatch();

    Animated.timing({} as never, { duration: 100, useNativeDriver: true } as never);
    Animated.spring({} as never, { tension: 1, useNativeDriver: true } as never);
    Animated.decay({} as never, { velocity: 1, useNativeDriver: true } as never);
    (Animated.event as typeof Animated.event)([] as never, { useNativeDriver: true } as never);

    expect(timingSpy).toHaveBeenCalledWith({}, { duration: 100, useNativeDriver: false });
    expect(springSpy).toHaveBeenCalledWith({}, { tension: 1, useNativeDriver: false });
    expect(decaySpy).toHaveBeenCalledWith({}, { velocity: 1, useNativeDriver: false });
    expect(eventSpy).toHaveBeenCalledWith([], { useNativeDriver: false });
  });
});

describe('layout helpers rendering', () => {
  it('renders HeaderRightPill for guests and signed-in users', () => {
    mockUseAuth.mockReturnValueOnce({ user: null });
    const { rerender } = renderWithProviders(<HeaderRightPill />);
    expect(screen.getByText('Sign In')).toBeOnTheScreen();

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
