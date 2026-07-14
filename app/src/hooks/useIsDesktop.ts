import { useBreakpoint } from './useBreakpoint';

/**
 * Returns true when running on web with a viewport >= desktop breakpoint.
 * Centralizes the Platform + width check that was duplicated across several screens.
 */
export function useIsDesktop() {
  return useBreakpoint().isMd;
}
