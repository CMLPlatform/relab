import type { TextStyle, ViewStyle } from 'react-native';
import { spacing } from '@/constants';

/** Shared dialog title/actions styles. Size comes from `AppText variant="title"`. */
export const dialogTitleStyle: TextStyle = {
  fontWeight: '600',
  marginBottom: spacing.sm,
};
export const dialogActionsStyle: ViewStyle = {
  flexDirection: 'row',
  justifyContent: 'flex-end',
  gap: spacing.xs,
  marginTop: spacing.md,
};
