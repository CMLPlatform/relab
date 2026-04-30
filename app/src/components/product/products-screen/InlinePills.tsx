import { MaterialCommunityIcons } from '@expo/vector-icons';
import { View } from 'react-native';
import { Text } from 'react-native-paper';
import { useAppTheme } from '@/theme';
import { productsScreenStyles as styles } from './shared';

type NewProductPillProps = {
  label?: string;
};

export function NewProductPill({ label = 'New Product' }: NewProductPillProps) {
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
      <Text style={[styles.inlineButtonText, { color: theme.colors.onPrimaryContainer }]}>
        {label}
      </Text>
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
      <Text style={[styles.inlineProfileText, { color: theme.colors.onBackground }]}>profile</Text>
    </View>
  );
}
