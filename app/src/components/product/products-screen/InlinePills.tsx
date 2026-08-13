import { View } from 'react-native';
import { AppText } from '@/components/base/AppText';
import { Icon } from '@/components/base/Icon';
import { useAppTheme } from '@/theme';
import { productsScreenStyles as styles } from './shared';

type NewProductPillProps = {
  label?: string;
};

export function NewProductPill({ label = 'New product' }: NewProductPillProps) {
  const theme = useAppTheme();

  // ponytail: renders as plain emphasized text, not a pill shape — it names the
  // real "New product" control elsewhere on screen rather than acting as one,
  // so it shouldn't look tappable (design critique P3 #1).
  return (
    <AppText
      className="font-bold"
      style={[styles.inlineButtonText, { color: theme.colors.primary }]}
    >
      {label}
    </AppText>
  );
}

export function ProfilePill() {
  const theme = useAppTheme();

  return (
    <View
      className="flex-row items-center gap-1 self-center rounded-full px-2 py-0.5"
      style={{ backgroundColor: theme.tokens.surface.accent }}
    >
      <Icon name="circle-user-round" size={14} color={theme.colors.primary} />
      <AppText
        testID="profile-pill-label"
        className="font-bold"
        style={[styles.inlineProfileText, { color: theme.colors.primary }]}
      >
        account
      </AppText>
    </View>
  );
}
