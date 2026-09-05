import { usePathname } from 'expo-router';
import { AUTH_HERO_PATHS, HERO_BAND_PATHS } from '@/constants';
import { getAppTheme } from '@/theme';

// Hero screens keep the background photo visible, so they get a light scrim
// instead of the near-opaque page overlay other screens use.
function isHeroPath(pathname: string) {
  return AUTH_HERO_PATHS.some((path) => pathname.includes(path));
}

function isBandPath(pathname: string) {
  return HERO_BAND_PATHS.some((path) => pathname.includes(path));
}

export type BackgroundOverlay = {
  /** Flat fill, or the centre band when `edgeColor` is set. */
  color: string;
  /**
   * Set only on the band routes, where the scrim is a horizontal gradient: the
   * near-clear colour at the left and right edges. `null` means paint a flat
   * fill instead.
   */
  edgeColor: string | null;
};

/** The scrim drawn over the static background image for the current route. */
export function useBackgroundOverlay(isDark: boolean): BackgroundOverlay {
  const pathname = usePathname();
  const { overlay } = getAppTheme(isDark ? 'dark' : 'light').tokens;
  if (isBandPath(pathname)) {
    return { color: overlay.heroBand, edgeColor: overlay.heroEdge };
  }
  if (isHeroPath(pathname)) {
    return { color: overlay.hero, edgeColor: null };
  }
  return { color: overlay.page, edgeColor: null };
}
