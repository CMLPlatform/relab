import { usePathname } from 'expo-router';
import { AUTH_HERO_PATHS } from '@/constants';
import { getAppTheme } from '@/theme';

// Hero screens keep the background photo visible, so they get a light scrim
// instead of the near-opaque page overlay other screens use.
function isHeroPath(pathname: string) {
  return AUTH_HERO_PATHS.some((path) => pathname.includes(path));
}

// The scrim colour drawn over the static background image for the current route.
export function useBackgroundOverlayColor(isDark: boolean): string {
  const pathname = usePathname();
  const { overlay } = getAppTheme(isDark ? 'dark' : 'light').tokens;
  return isHeroPath(pathname) ? overlay.hero : overlay.page;
}
