import { StyleSheet } from 'react-native';
import type { AppTheme } from '@/theme';
import { memoizeByTheme } from '@/theme';

// Theme-dependent color with no CSS var (tokens.*, surfaceVariant) stays in `style`.
export const createProfileSectionStyles = memoizeByTheme((theme: AppTheme) => {
  return StyleSheet.create({
    docsLink: {
      color: theme.tokens.text.link,
    },
    themeModeOption: {
      borderColor: theme.tokens.border.subtle,
    },
    themeModeOptionActive: {
      borderColor: theme.tokens.border.strong,
      backgroundColor: theme.tokens.surface.accent,
    },
    visibilityOptionActive: {
      backgroundColor: theme.tokens.surface.accent,
    },
    danger: {
      color: theme.tokens.status.danger,
    },
    statItem: {
      backgroundColor: theme.tokens.surface.accent,
    },
    unlinkWarning: {
      color: theme.tokens.status.warning,
    },
  });
});
