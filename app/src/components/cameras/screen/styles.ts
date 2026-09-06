import { StyleSheet } from 'react-native';
import { radius } from '@/constants';
import type { AppTheme } from '@/theme';
import { memoizeByTheme } from '@/theme';
import { getFloatingPosition } from '@/utils/platformLayout';

// Only what has no className equivalent stays here (conditional states, a
// JS-only token, the Fab position).
export const createCameraScreenStyles = memoizeByTheme((theme: AppTheme) => {
  return StyleSheet.create({
    row: {
      gap: 10,
    },
    // Mixing a className with a function style drops the function (see IconButton.tsx).
    cellPressable: {
      borderRadius: radius.card,
    },
    cellPressed: {
      opacity: 0.9,
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
