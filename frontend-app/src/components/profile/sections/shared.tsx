import type { ReactNode } from 'react';
import { Pressable, ScrollView, type TextStyle, View } from 'react-native';
import { Divider, Icon } from 'react-native-paper';
import { Text } from '@/components/base/Text';
import { createProfileSectionStyles } from '@/components/profile/sections/styles';
import { useAppTheme } from '@/theme';

export type OAuthAccount = {
  account_email?: string | null;
};

type ProfileSectionHeaderProps = {
  title: string;
};

export function ProfileSectionHeader({ title }: ProfileSectionHeaderProps) {
  const styles = useStyles();
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
  const styles = useStyles();
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
  const styles = useStyles();
  return <ScrollView contentContainerStyle={styles.container}>{children}</ScrollView>;
}

function useStyles() {
  return createProfileSectionStyles(useAppTheme());
}
