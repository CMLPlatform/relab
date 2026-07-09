import { renderHook } from '@testing-library/react-native';
import { usePathname } from 'expo-router';
import { getAppTheme } from '@/theme';
import { useBackgroundOverlayColor } from '@/utils/router/background';

jest.mock('expo-router', () => ({ usePathname: jest.fn() }));

const mockUsePathname = jest.mocked(usePathname);

function overlayFor(pathname: string, isDark = false) {
  mockUsePathname.mockReturnValue(pathname);
  return renderHook(() => useBackgroundOverlayColor(isDark)).result.current;
}

describe('useBackgroundOverlayColor', () => {
  const { overlay } = getAppTheme('light').tokens;

  // Every `headerShown: false` (auth) screen in app/_layout.tsx is a hero screen:
  // a card floating over the background photo, which the page scrim would hide.
  it.each([
    '/login',
    '/new-account',
    '/onboarding',
    '/forgot-password',
    '/reset-password',
  ])('uses the light hero scrim on %s', (pathname) => {
    expect(overlayFor(pathname)).toBe(overlay.hero);
  });

  it.each([
    '/products',
    '/cameras',
    '/account',
    '/mfa',
  ])('uses the near-opaque page overlay on %s', (pathname) => {
    expect(overlayFor(pathname)).toBe(overlay.page);
  });

  it('resolves the scrim against the active colour scheme', () => {
    expect(overlayFor('/login', true)).toBe(getAppTheme('dark').tokens.overlay.hero);
  });
});
