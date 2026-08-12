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

  return (
    <View
      className="self-center rounded-full px-2 py-0.5"
      style={{ backgroundColor: theme.colors.primaryContainer }}
    >
      <AppText
        className="font-bold"
        style={[styles.inlineButtonText, { color: theme.colors.onPrimaryContainer }]}
      >
        {label}
      </AppText>
    </View>
  );
}

export function ProfilePill() {
  const theme = useAppTheme();

  return (
    <View
      className="flex-row items-center gap-1 self-center rounded-full px-2 py-0.5"
      style={{ backgroundColor: theme.colors.primaryContainer }}
    >
      <Icon name="account-circle" size={14} color={theme.colors.onPrimaryContainer} />
      <AppText
        testID="profile-pill-label"
        className="font-bold"
        style={[styles.inlineProfileText, { color: theme.colors.onPrimaryContainer }]}
      >
        account
      </AppText>
    </View>
  );
}
