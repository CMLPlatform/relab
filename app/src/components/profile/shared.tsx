import { ChevronRight } from 'lucide-react-native';
import { Pressable, type TextStyle, View } from 'react-native';
import { AppText } from '@/components/base/AppText';
import { Icon } from '@/components/base/ui/icon';
import { useAppTheme } from '@/theme';
import { createProfileSectionStyles } from './styles';

export type OAuthAccount = {
  account_email?: string | null;
};

type ProfileActionProps = {
  onPress: () => void;
  title: string;
  subtitle?: string;
  titleStyle?: TextStyle;
  hideChevron?: boolean;
};

/** A tappable settings row: title, optional subtitle, chevron. Rows within one Section. */
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
      className="min-h-11"
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
    >
      <View style={styles.actionCopy}>
        <AppText style={[styles.actionTitle, titleStyle]}>{title}</AppText>
        {subtitle ? <AppText style={styles.actionSubtitle}>{subtitle}</AppText> : null}
      </View>
      {!hideChevron ? <Icon as={ChevronRight} size={26} className="opacity-70" /> : null}
    </Pressable>
  );
}

function useStyles() {
  return createProfileSectionStyles(useAppTheme());
}
