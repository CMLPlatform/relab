import { StyleSheet } from 'react-native';
import { radius } from '@/constants';
import { memoizeByTheme } from '@/theme/memoizeByTheme';
import type { AppTheme } from '@/theme/types';
import { getFloatingPosition } from '@/utils/platformLayout';

// Only what has no className equivalent stays here (conditional states, a
// JS-only token, the Fab position).
export const createCameraScreenStyles = memoizeByTheme((theme: AppTheme) => {
  return StyleSheet.create({
    row: {
      gap: 10,
    },
    cellPressable: {
      borderRadius: radius.card,
    },
    cellSelected: {
      borderWidth: 3,
      borderColor: theme.tokens.border.selected,
    },
    fab: {
      position: getFloatingPosition(),
      right: 16,
      bottom: 16,
    },
  });
});
