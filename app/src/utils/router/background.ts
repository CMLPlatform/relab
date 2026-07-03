import { usePathname } from 'expo-router';
import { type ComponentType, useEffect, useState } from 'react';
import { getAppTheme } from '@/theme';
import { ensureWebAnimatedPatch as ensureWebAnimatedPatchInternal } from './animatedPatch';
import { loadAnimatedBackground } from './backgroundLoader';

const NO_OVERLAY_PATHS = ['/login', '/new-account', '/onboarding'];

function shouldShowOverlay(pathname: string) {
  return !NO_OVERLAY_PATHS.some((path) => pathname.includes(path));
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
  const showOverlay = shouldShowOverlay(pathname);
  const overlayColor = getAppTheme(isDark ? 'dark' : 'light').tokens.overlay.page;
  const BackgroundComponent = useLazyAnimatedBackground();

  return {
    BackgroundComponent,
    overlayColor,
    showOverlay,
  };
}
