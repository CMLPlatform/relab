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
  /** Edge colour of the band routes' horizontal gradient; `null` means a flat fill. */
  edgeColor: string | null;
  /** Whether the teardown photo is mounted under the fill (auth routes only). */
  photo: boolean;
};

/** The route's backdrop: photo + scrim on auth routes, the plain theme background elsewhere. */
export function useBackgroundOverlay(isDark: boolean): BackgroundOverlay {
  const pathname = usePathname();
  const { colors, tokens } = getAppTheme(isDark ? 'dark' : 'light');
  const { overlay } = tokens;
  if (isBandPath(pathname)) {
    return { color: overlay.heroBand, edgeColor: overlay.heroEdge, photo: true };
  }
  if (isHeroPath(pathname)) {
    return { color: overlay.hero, edgeColor: null, photo: true };
  }
  return { color: colors.background, edgeColor: null, photo: false };
}
