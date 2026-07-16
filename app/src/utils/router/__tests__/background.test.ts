import { renderHook } from '@testing-library/react-native';
import { usePathname } from 'expo-router';
import { getAppTheme } from '@/theme';
import { useBackgroundOverlay } from '@/utils/router/background';

jest.mock('expo-router', () => ({ usePathname: jest.fn() }));

const mockUsePathname = jest.mocked(usePathname);

function overlayFor(pathname: string, isDark = false) {
  mockUsePathname.mockReturnValue(pathname);
  return renderHook(() => useBackgroundOverlay(isDark)).result.current;
}

describe('useBackgroundOverlay', () => {
  const { overlay } = getAppTheme('light').tokens;

  // Every `headerShown: false` (auth) screen in app/_layout.tsx is a hero screen:
  // a card floating over the background photo, which the page scrim would hide.
  it.each([
    '/login',
    '/new-account',
    '/onboarding',
    '/forgot-password',
    '/reset-password',
    '/mfa',
    '/verify',
  ])('uses the hero gradient bands on %s', (pathname) => {
    expect(overlayFor(pathname)).toEqual({
      color: overlay.hero,
      edgeColor: overlay.heroEdge,
    });
  });

  // edgeColor null is what tells AppBackground to paint a flat fill rather than
  // a gradient, so it is part of the contract, not an incidental value.
  it.each([
    '/products',
    '/cameras',
    '/account',
  ])('uses the flat near-opaque page overlay on %s', (pathname) => {
    expect(overlayFor(pathname)).toEqual({ color: overlay.page, edgeColor: null });
  });

  it('resolves the scrim against the active colour scheme', () => {
    const dark = getAppTheme('dark').tokens.overlay;
    expect(overlayFor('/login', true)).toEqual({
      color: dark.hero,
      edgeColor: dark.heroEdge,
    });
  });
});
