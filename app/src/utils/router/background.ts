import { usePathname } from 'expo-router';
import { AUTH_HERO_PATHS } from '@/constants';
import { getAppTheme } from '@/theme';

// Hero screens keep the background photo visible, so they get a light scrim
// instead of the near-opaque page overlay other screens use.
function isHeroPath(pathname: string) {
  return AUTH_HERO_PATHS.some((path) => pathname.includes(path));
}

export type BackgroundOverlay = {
  /** Fill for a page overlay, or the centre band of a hero gradient. */
  color: string;
  /**
   * Set only on hero routes, where the scrim is a horizontal gradient: this is
   * the near-clear colour at the left and right edges. `null` means paint a
   * flat fill instead.
   */
  edgeColor: string | null;
};

/** The scrim drawn over the static background image for the current route. */
export function useBackgroundOverlay(isDark: boolean): BackgroundOverlay {
  const pathname = usePathname();
  const { overlay } = getAppTheme(isDark ? 'dark' : 'light').tokens;
  return isHeroPath(pathname)
    ? { color: overlay.hero, edgeColor: overlay.heroEdge }
    : { color: overlay.page, edgeColor: null };
}
