import { StyleSheet } from 'react-native';
import { radius } from '@/constants';
import type { AppTheme } from '@/theme';
import { memoizeByTheme } from '@/theme';
import { getFloatingPosition } from '@/utils/platformLayout';

// Residue after the NativeWind convergence: layout, spacing and radius moved
// to className at the call site. What's left needs JS: conditional
// pressed/selected states with no confirmed NativeWind variant support here,
// a JS-only theme token, and the Fab position (Fab has no className prop —
// see Fab.tsx).
export const createCameraScreenStyles = memoizeByTheme((theme: AppTheme) => {
  return StyleSheet.create({
    row: {
      gap: 10,
    },
    // Static base for the cell's state-callback style. Can't move to a
    // className: mixing one with a function style drops the function
    // (see IconButton.tsx).
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
