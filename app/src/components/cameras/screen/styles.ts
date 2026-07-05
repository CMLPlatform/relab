import { StyleSheet } from 'react-native';
import type { AppTheme } from '@/theme';
import { memoizeByTheme } from '@/theme';
import { getFloatingPosition } from '@/utils/platformLayout';

export const createCameraScreenStyles = memoizeByTheme((theme: AppTheme) => {
  return StyleSheet.create({
    list: {
      padding: 12,
      paddingBottom: 88,
      gap: 10,
    },
    emptyList: {
      flex: 1,
    },
    row: {
      gap: 10,
    },
    cell: {
      flex: 1,
    },
    cellPressable: {
      borderRadius: 14,
    },
    cellPressed: {
      opacity: 0.9,
    },
    cellSelected: {
      borderWidth: 3,
      borderColor: theme.tokens.border.selected,
    },
    empty: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 32,
    },
    emptyIcon: {
      opacity: 0.4,
    },
    emptyTitle: {
      marginTop: 16,
      opacity: 0.6,
    },
    emptyBody: {
      marginTop: 8,
      opacity: 0.5,
      textAlign: 'center',
    },
    fab: {
      position: getFloatingPosition(),
      right: 16,
      bottom: 16,
    },
  });
});
