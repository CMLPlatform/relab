import { StyleSheet } from 'react-native';
import { radius } from '@/constants';
import type { AppTheme } from '@/theme';
import { memoizeByTheme } from '@/theme';

export const createProfileSectionStyles = memoizeByTheme((theme: AppTheme) => {
  return StyleSheet.create({
    greyChip: {
      backgroundColor: theme.colors.surfaceVariant,
    },
    section: {
      marginHorizontal: 4,
    },
    integrationRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 10,
      paddingHorizontal: 16,
      gap: 12,
    },
    integrationIcon: {
      width: 32,
      alignItems: 'center',
    },
    integrationCopy: {
      flex: 1,
    },
    docsLink: {
      color: theme.tokens.text.link,
      textDecorationLine: 'underline',
    },
    action: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 10,
      paddingHorizontal: 16,
    },
    actionCopy: {
      flex: 1,
    },
    actionTitle: {
      fontSize: 16,
      fontWeight: '600',
    },
    actionSubtitle: {
      fontSize: 13,
      opacity: 0.55,
      marginTop: 1,
    },
    themeModeRow: {
      flexDirection: 'row',
      gap: 8,
      paddingVertical: 10,
      paddingHorizontal: 16,
    },
    themeModeOption: {
      flex: 1,
      alignItems: 'center',
      gap: 6,
      paddingVertical: 12,
      borderRadius: radius.card,
      borderWidth: 1,
      borderColor: theme.tokens.border.subtle,
    },
    themeModeOptionActive: {
      borderColor: theme.tokens.border.strong,
      backgroundColor: theme.tokens.surface.accent,
    },
    themeModeLabel: {
      fontSize: 12,
      fontWeight: '600',
    },
    visibilityOption: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 12,
      paddingHorizontal: 16,
      borderRadius: radius.card,
      marginVertical: 2,
    },
    visibilityOptionActive: {
      backgroundColor: theme.tokens.surface.accent,
    },
    visibilityIcon: {
      width: 32,
      alignItems: 'center',
    },
    newsletterRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      paddingVertical: 10,
      paddingHorizontal: 16,
      gap: 12,
    },
    newsletterCopy: {
      flex: 1,
    },
    newsletterState: {
      marginTop: 6,
      fontSize: 13,
      fontWeight: '600',
    },
    danger: {
      color: theme.tokens.status.danger,
    },
    dangerSection: {
      marginBottom: 40,
    },
    statsRow: {
      flexDirection: 'row',
      paddingVertical: 16,
      paddingHorizontal: 12,
      gap: 8,
    },
    statItem: {
      flex: 1,
      alignItems: 'center',
      padding: 10,
      backgroundColor: theme.tokens.surface.accent,
      borderRadius: radius.card,
    },
    statValue: {
      fontSize: 20,
      fontWeight: 'bold',
    },
    statLabel: {
      fontSize: 10,
      fontWeight: '600',
      opacity: 0.5,
      textTransform: 'uppercase',
      marginTop: 2,
    },
    deleteEmail: {
      marginTop: 10,
      fontWeight: 'bold',
    },
    deleteMessage: {
      marginTop: 10,
    },
    unlinkWarning: {
      marginTop: 10,
      color: theme.tokens.status.warning,
    },
  });
});
