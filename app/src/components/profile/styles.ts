import { StyleSheet } from 'react-native';
import type { AppTheme } from '@/theme';
import { memoizeByTheme } from '@/theme';

// Residue after the NativeWind convergence: everything with an exact class
// (layout, spacing, radius, border, fontSize) moved to className at the call
// site. What's left is theme-dependent color with no CSS var (tokens.*,
// surfaceVariant) — that residue is deliberate.
export const createProfileSectionStyles = memoizeByTheme((theme: AppTheme) => {
  return StyleSheet.create({
    greyChip: {
      backgroundColor: theme.colors.surfaceVariant,
    },
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
