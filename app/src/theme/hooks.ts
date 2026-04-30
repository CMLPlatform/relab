import { useTheme as usePaperTheme } from 'react-native-paper';
import type { AppTheme } from '@/theme/types';

export function useAppTheme() {
  return usePaperTheme<AppTheme>();
}
