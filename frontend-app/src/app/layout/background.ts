import { usePathname } from 'expo-router';
import { type ComponentType, useEffect, useState } from 'react';
import { ensureWebAnimatedPatch as ensureWebAnimatedPatchInternal } from '@/app/layout/animatedPatch';
import { loadAnimatedBackground } from '@/app/layout/backgroundLoader';
import { getAppTheme } from '@/theme';

const NO_OVERLAY_PATHS = ['/login', '/new-account', '/onboarding'];

function shouldShowOverlay(pathname: string) {
  return !NO_OVERLAY_PATHS.some((path) => pathname.includes(path));
}

function useLazyAnimatedBackground(showBackground: boolean) {
  const [BackgroundComponent, setBackgroundComponent] = useState<ComponentType | null>(null);

  useEffect(() => {
    if (!showBackground || BackgroundComponent) return;

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
  }, [BackgroundComponent, showBackground]);

  return BackgroundComponent;
}

export function ensureWebAnimatedPatch() {
  return ensureWebAnimatedPatchInternal();
}

export function useAnimatedBackground(isDark: boolean) {
  const pathname = usePathname();
  const showBackground = true;
  const showOverlay = shouldShowOverlay(pathname);
  const overlayColor = getAppTheme(isDark ? 'dark' : 'light').tokens.overlay.page;
  const BackgroundComponent = useLazyAnimatedBackground(showBackground);

  return {
    BackgroundComponent,
    overlayColor,
    showBackground,
    showOverlay,
  };
}
