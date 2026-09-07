import { afterEach } from '@jest/globals';
import { act, renderHook } from '@testing-library/react-native';
import { Dimensions } from 'react-native';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { mockPlatform, restorePlatform } from '@/test-utils/index';

const originalWindow = Dimensions.get('window');

afterEach(() => {
  restorePlatform();
  act(() => {
    Dimensions.set({ window: originalWindow, screen: originalWindow });
  });
});

test.each([
  [500, false, false],
  [800, true, false],
  [1200, true, true],
])('width %d on web -> isMd %s, isLg %s', (width, isMd, isLg) => {
  mockPlatform('web');
  Dimensions.set({
    window: { width, height: 800, scale: 1, fontScale: 1 },
    screen: { width, height: 800, scale: 1, fontScale: 1 },
  });
  const { result } = renderHook(() => useBreakpoint());
  expect(result.current).toEqual({ isMd, isLg });
});

test('native is never md/lg regardless of width', () => {
  mockPlatform('ios');
  Dimensions.set({
    window: { width: 1200, height: 800, scale: 1, fontScale: 1 },
    screen: { width: 1200, height: 800, scale: 1, fontScale: 1 },
  });
  const { result } = renderHook(() => useBreakpoint());
  expect(result.current).toEqual({ isMd: false, isLg: false });
});
