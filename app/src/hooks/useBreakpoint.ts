import { Platform, useWindowDimensions } from 'react-native';
import { breakpoints } from '@/constants';

/** Web-only width tiers matching the Tailwind screens in global.css. */
export function useBreakpoint() {
  const { width } = useWindowDimensions();
  const isWeb = Platform.OS === 'web';
  return {
    isMd: isWeb && width >= breakpoints.md,
    isLg: isWeb && width >= breakpoints.lg,
  };
}
