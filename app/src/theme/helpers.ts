import { alpha } from '@/theme/color';
import type { AppTheme } from '@/theme/types';

export function getStatusColor(
  theme: AppTheme,
  status: 'online' | 'offline' | 'unauthorized' | 'forbidden' | 'error',
) {
  switch (status) {
    case 'online':
      return theme.tokens.status.success;
    case 'offline':
      return theme.tokens.status.offline;
    case 'unauthorized':
    case 'forbidden':
      return theme.tokens.status.warning;
    case 'error':
      return theme.tokens.status.danger;
  }
}

export function getStatusTone(_theme: AppTheme, color: string, opacity = 0.12) {
  return alpha(color, opacity);
}
