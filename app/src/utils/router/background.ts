import { usePathname } from 'expo-router';
import { type ComponentType, useEffect, useState } from 'react';
import { getAppTheme } from '@/theme';
import { ensureWebAnimatedPatch as ensureWebAnimatedPatchInternal } from './animatedPatch';
import { loadAnimatedBackground } from './backgroundLoader';

// Hero screens keep the background photo visible, so they get a light scrim
// instead of the near-opaque page overlay other screens use.
const HERO_OVERLAY_PATHS = ['/login', '/new-account', '/onboarding'];

function isHeroPath(pathname: string) {
  return HERO_OVERLAY_PATHS.some((path) => pathname.includes(path));
}

function useLazyAnimatedBackground() {
  const [BackgroundComponent, setBackgroundComponent] = useState<ComponentType | null>(null);

  useEffect(() => {
    if (BackgroundComponent) return;

    let isMounted = true;
    loadAnimatedBackground()
      .then((AnimatedBackground) => {
        if (!isMounted) return;
        setBackgroundComponent(() => AnimatedBackground);
      })
      .catch(() => {});

    return () => {
      isMounted = false;
    };
  }, [BackgroundComponent]);

  return BackgroundComponent;
}

export function ensureWebAnimatedPatch() {
  return ensureWebAnimatedPatchInternal();
}

export function useAnimatedBackground(isDark: boolean) {
  const pathname = usePathname();
  const { overlay } = getAppTheme(isDark ? 'dark' : 'light').tokens;
  const overlayColor = isHeroPath(pathname) ? overlay.hero : overlay.page;
  const BackgroundComponent = useLazyAnimatedBackground();

  return {
    BackgroundComponent,
    overlayColor,
    showOverlay: true,
  };
}
