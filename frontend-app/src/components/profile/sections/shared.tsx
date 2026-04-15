import type { ReactNode } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, type TextStyle, View } from 'react-native';
import { Divider, Icon } from 'react-native-paper';
import { Text } from '@/components/base/Text';

export type OAuthAccount = {
  account_email?: string | null;
};

type ProfileSectionHeaderProps = {
  title: string;
};

export function ProfileSectionHeader({ title }: ProfileSectionHeaderProps) {
  return (
    <>
      <Divider style={styles.divider} />
      <Text style={styles.sectionTitle}>{title}</Text>
    </>
  );
}

type ProfileActionProps = {
  onPress: () => void;
  title: string;
  subtitle?: string;
  titleStyle?: TextStyle;
  hideChevron?: boolean;
};

export function ProfileAction({
  onPress,
  title,
  subtitle,
  titleStyle,
  hideChevron = false,
}: ProfileActionProps) {
  return (
    <Pressable
      style={styles.action}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
    >
      <View style={styles.actionCopy}>
        <Text style={[styles.actionTitle, titleStyle]}>{title}</Text>
        {subtitle ? <Text style={styles.actionSubtitle}>{subtitle}</Text> : null}
      </View>
      {!hideChevron ? <Icon source="chevron-right" size={26} /> : null}
    </Pressable>
  );
}

type ProfileLayoutProps = {
  children: ReactNode;
};

export function ProfileLayout({ children }: ProfileLayoutProps) {
  return <ScrollView contentContainerStyle={styles.container}>{children}</ScrollView>;
}

export const profileSectionStyles = StyleSheet.create({
  container: {
    paddingBottom: 40,
  },
  hero: {
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 24,
  },
  hiText: {
    fontSize: 28,
    opacity: 0.6,
  },
  usernameText: {
    fontSize: Platform.OS === 'web' ? 48 : 72,
    fontWeight: 'bold',
    lineHeight: Platform.OS === 'web' ? 56 : 80,
  },
  metaRow: {
    marginTop: 16,
    gap: 4,
  },
  metaText: {
    fontSize: 15,
    opacity: 0.65,
  },
  chipRow: {
    marginTop: 12,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  greyChip: {
    backgroundColor: 'lightgrey',
  },
  divider: {
    marginTop: 24,
    marginBottom: 4,
    marginHorizontal: 20,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    opacity: 0.45,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginHorizontal: 20,
    marginTop: 8,
    marginBottom: 2,
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
    color: '#1565C0',
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
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(128,128,128,0.2)',
  },
  themeModeOptionActive: {
    borderColor: 'rgba(128,128,128,0.5)',
    backgroundColor: 'rgba(128,128,128,0.1)',
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
    borderRadius: 12,
    marginVertical: 2,
  },
  visibilityOptionActive: {
    backgroundColor: 'rgba(128,128,128,0.05)',
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
  newsletterFooter: {
    alignItems: 'flex-start',
    paddingHorizontal: 16,
  },
  newsletterError: {
    paddingTop: 6,
    color: '#d32f2f',
    fontSize: 13,
  },
  danger: {
    color: '#d32f2f',
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
    backgroundColor: 'rgba(128,128,128,0.05)',
    borderRadius: 12,
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
});

const styles = profileSectionStyles;
