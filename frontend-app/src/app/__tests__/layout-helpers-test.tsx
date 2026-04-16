import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { screen } from '@testing-library/react-native';
import { Animated, Platform } from 'react-native';
import {
  ensureWebAnimatedPatch,
  getProductsHeaderStyle,
  HeaderRightPill,
} from '@/app/layout/helpers';
import { renderWithProviders } from '@/test-utils';

const mockPush = jest.fn();
const mockUseAuth = jest.fn();
const mockUsePathname = jest.fn(() => '/products');

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
  usePathname: () => mockUsePathname(),
}));

jest.mock('@/context/AuthProvider', () => ({
  useAuth: () => mockUseAuth(),
}));

jest.mock('@/components/common/AnimatedBackground', () => ({
  AnimatedBackground: () => null,
}));

describe('layout helpers', () => {
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

  it('returns dark and light product header styles', () => {
    expect(getProductsHeaderStyle(false).headerTitleStyle.color).toBeDefined();
    expect(getProductsHeaderStyle(true).headerTitleStyle.color).toBeDefined();
    expect(getProductsHeaderStyle(false).headerStyle.backgroundColor).not.toBe(
      getProductsHeaderStyle(true).headerStyle.backgroundColor,
    );
  });
});
