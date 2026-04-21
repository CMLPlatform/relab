import { Platform, useWindowDimensions } from 'react-native';
import { breakpoints } from '@/constants/layout';

/**
 * Returns true when running on web with a viewport >= desktop breakpoint.
 * Centralizes the Platform + width check that was duplicated across several screens.
 */
export function useIsDesktop() {
  const { width } = useWindowDimensions();
  return Platform.OS === 'web' && width >= breakpoints.desktop;
}
