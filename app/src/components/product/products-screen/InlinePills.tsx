import { MaterialCommunityIcons } from '@expo/vector-icons';
import { View } from 'react-native';
import { AppText } from '@/components/base/AppText';
import { useAppTheme } from '@/theme';
import { productsScreenStyles as styles } from './shared';

type NewProductPillProps = {
  label?: string;
};

export function NewProductPill({ label = 'New product' }: NewProductPillProps) {
  const theme = useAppTheme();

  return (
    <View
      style={[
        styles.inlineButtonPill,
        {
          backgroundColor: theme.colors.primaryContainer,
        },
      ]}
    >
      <AppText style={[styles.inlineButtonText, { color: theme.colors.onPrimaryContainer }]}>
        {label}
      </AppText>
    </View>
  );
}

export function ProfilePill() {
  const theme = useAppTheme();

  return (
    <View
      style={[
        styles.inlineProfilePill,
        {
          backgroundColor: theme.tokens.overlay.glass,
        },
      ]}
    >
      <MaterialCommunityIcons name="account-circle" size={14} color={theme.colors.onBackground} />
      <AppText
        testID="profile-pill-label"
        style={[styles.inlineProfileText, { color: theme.colors.onBackground }]}
      >
        account
      </AppText>
    </View>
  );
}
