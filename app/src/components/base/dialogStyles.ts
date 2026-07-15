import type { TextStyle, ViewStyle } from 'react-native';
import { spacing } from '@/constants';

/** Shared dialog title/actions styles — reused across the app's dialogs so the
 *  heading weight and the right-aligned action row stay consistent. */
export const dialogTitleStyle: TextStyle = {
  fontSize: 18,
  fontWeight: '600',
  marginBottom: spacing.sm,
};
export const dialogActionsStyle: ViewStyle = {
  flexDirection: 'row',
  justifyContent: 'flex-end',
  gap: spacing.xs,
  marginTop: spacing.md,
};
