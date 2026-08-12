import { StyleSheet } from 'react-native';
import type { AppTheme } from '@/theme';
import { memoizeByTheme } from '@/theme';

// Residue after the NativeWind convergence: everything with an exact class
// (layout, spacing, radius, border) moved to className at the call site.
// What's left is theme-dependent color with no CSS var (tokens.*, surfaceVariant)
// or a fontSize override that must leave AppText's body-scale lineHeight (26)
// untouched — a text-* class would carry its own, different lineHeight.
export const createProfileSectionStyles = memoizeByTheme((theme: AppTheme) => {
  return StyleSheet.create({
    greyChip: {
      backgroundColor: theme.colors.surfaceVariant,
    },
    docsLink: {
      color: theme.tokens.text.link,
    },
    actionSubtitle: {
      fontSize: 13,
    },
    themeModeOption: {
      borderColor: theme.tokens.border.subtle,
    },
    themeModeOptionActive: {
      borderColor: theme.tokens.border.strong,
      backgroundColor: theme.tokens.surface.accent,
    },
    themeModeLabel: {
      fontSize: 12,
    },
    visibilityOptionActive: {
      backgroundColor: theme.tokens.surface.accent,
    },
    newsletterState: {
      fontSize: 13,
    },
    danger: {
      color: theme.tokens.status.danger,
    },
    statItem: {
      backgroundColor: theme.tokens.surface.accent,
    },
    statValue: {
      fontSize: 20,
    },
    statLabel: {
      fontSize: 10,
    },
    unlinkWarning: {
      color: theme.tokens.status.warning,
    },
  });
});
