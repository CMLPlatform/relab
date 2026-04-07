import { afterEach, describe, expect, it } from '@jest/globals';
import { act, renderHook } from '@testing-library/react-native';
import { Dimensions } from 'react-native';
import { breakpoints } from '@/constants/layout';
import { mockPlatform, restorePlatform } from '@/test-utils';
import { useIsDesktop } from '../useIsDesktop';

const originalWindow = Dimensions.get('window');

// Platform is native by default in Jest (Platform.OS === 'ios')
describe('useIsDesktop', () => {
  afterEach(() => {
    restorePlatform();
    act(() => {
      Dimensions.set({ window: originalWindow, screen: originalWindow });
    });
  });

  it('returns false on native (not web)', () => {
    const { result } = renderHook(() => useIsDesktop());
    expect(result.current).toBe(false);
  });

  it('returns false on native even with a wide viewport', () => {
    Dimensions.set({
      window: { width: 1200, height: 900, scale: 1, fontScale: 1 },
      screen: { width: 1200, height: 900, scale: 1, fontScale: 1 },
    });
    const { result } = renderHook(() => useIsDesktop());
    expect(result.current).toBe(false);
  });

  it('returns true on web with viewport >= desktop breakpoint', () => {
    mockPlatform('web');
    Dimensions.set({
      window: { width: breakpoints.desktop, height: 1024, scale: 1, fontScale: 1 },
      screen: { width: breakpoints.desktop, height: 1024, scale: 1, fontScale: 1 },
    });
    const { result } = renderHook(() => useIsDesktop());
    expect(result.current).toBe(true);
  });

  it('returns false on web with viewport below desktop breakpoint', () => {
    mockPlatform('web');
    Dimensions.set({
      window: { width: breakpoints.desktop - 1, height: 800, scale: 1, fontScale: 1 },
      screen: { width: breakpoints.desktop - 1, height: 800, scale: 1, fontScale: 1 },
    });
    const { result } = renderHook(() => useIsDesktop());
    expect(result.current).toBe(false);
  });
});
