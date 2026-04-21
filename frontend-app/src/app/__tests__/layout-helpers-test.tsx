import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, renderHook, screen } from '@testing-library/react-native';
import type { ComponentType } from 'react';
import { Animated, Platform } from 'react-native';
import { ensureWebAnimatedPatch, useAnimatedBackground } from '@/app/layout/background';
import { loadAnimatedBackground } from '@/app/layout/backgroundLoader';
import { HeaderRightPill } from '@/app/layout/HeaderRightPill';
import { getProductsHeaderStyle } from '@/app/layout/styles';
import { renderWithProviders } from '@/test-utils/index';

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

jest.mock('@/components/common/AnimatedBackground', () => ({
  AnimatedBackground: () => null,
}));

jest.mock('@/app/layout/backgroundLoader', () => ({
  loadAnimatedBackground: jest.fn(),
}));

const mockLoadAnimatedBackground = jest.mocked(loadAnimatedBackground);
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
  mockLoadAnimatedBackground.mockResolvedValue(() => null);
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

  it('returns dark and light product header styles', () => {
    expect(getProductsHeaderStyle(false).headerTitleStyle.color).toBeDefined();
    expect(getProductsHeaderStyle(true).headerTitleStyle.color).toBeDefined();
    expect(getProductsHeaderStyle(false).headerStyle.backgroundColor).not.toBe(
      getProductsHeaderStyle(true).headerStyle.backgroundColor,
    );
  });

  it('returns overlay state for normal and auth routes', async () => {
    const { result, rerender } = renderHook<
      {
        BackgroundComponent: ComponentType | null;
        overlayColor: string;
        showBackground: boolean;
        showOverlay: boolean;
      },
      { isDark: boolean }
    >(({ isDark }) => useAnimatedBackground(isDark), {
      initialProps: { isDark: false },
    });

    expect(result.current.showBackground).toBe(true);
    expect(result.current.showOverlay).toBe(true);
    expect(result.current.overlayColor).toBe('rgba(242,242,242,0.95)');

    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.BackgroundComponent).not.toBeNull();

    mockUsePathname.mockReturnValue('/login');
    rerender({ isDark: true });

    expect(result.current.showOverlay).toBe(false);
    expect(result.current.overlayColor).toBe('rgba(10,10,10,0.90)');
  });
});
