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

  // Only these two have content bare on the photo, so only these two need the
  // gradient to read against.
  it.each(['/login', '/new-account'])('uses the hero gradient bands on %s', (pathname) => {
    expect(overlayFor(pathname)).toEqual({
      color: overlay.heroBand,
      edgeColor: overlay.heroEdge,
    });
  });

  // The rest of the auth flow puts everything on a card, so a flat light scrim
  // is enough and the backdrop stays livelier.
  it.each(['/onboarding', '/forgot-password', '/reset-password', '/mfa', '/verify'])(
    'uses the flat hero scrim on %s',
    (pathname) => {
      expect(overlayFor(pathname)).toEqual({ color: overlay.hero, edgeColor: null });
    },
  );

  // edgeColor null is what tells AppBackground to paint a flat fill rather than
  // a gradient, so it is part of the contract, not an incidental value.
  it.each(['/products', '/cameras', '/account'])(
    'uses the flat near-opaque page overlay on %s',
    (pathname) => {
      expect(overlayFor(pathname)).toEqual({ color: overlay.page, edgeColor: null });
    },
  );

  it('resolves the scrim against the active colour scheme', () => {
    const dark = getAppTheme('dark').tokens.overlay;
    expect(overlayFor('/login', true)).toEqual({
      color: dark.heroBand,
      edgeColor: dark.heroEdge,
    });
  });

  // A light film over a dark photo washes it the wrong way; the dark scrim has
  // to darken. Guards the bug where dark mode reused the light-mode colour.
  it('darkens rather than lightens in dark mode', () => {
    const dark = getAppTheme('dark').tokens.overlay;
    for (const band of [dark.hero, dark.heroBand, dark.heroEdge]) {
      // NOTE: rgba(...) is produced by this same theme module, so the digit groups are
      // always present; the non-null assertion is safe and an optional chain would only
      // trade this clear failure for a less clear one.
      // biome-ignore lint/style/noNonNullAssertion: format is guaranteed, see note above
      const [r, g, b] = band.match(/\d+/g)!.map(Number);
      expect(Math.max(r, g, b)).toBeLessThan(60);
    }
  });
});
