import { MaterialCommunityIcons } from '@expo/vector-icons';
import { View } from 'react-native';
import { Text, useTheme } from 'react-native-paper';
import { productsScreenStyles as styles } from './shared';

type NewProductPillProps = {
  label?: string;
};

export function NewProductPill({ label = 'New Product' }: NewProductPillProps) {
  const theme = useTheme();

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
  const theme = useTheme();

  return (
    <View
      style={[
        styles.inlineProfilePill,
        {
          backgroundColor: theme.dark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.07)',
        },
      ]}
    >
      <MaterialCommunityIcons name="account-circle" size={14} color={theme.colors.onBackground} />
      <Text style={[styles.inlineProfileText, { color: theme.colors.onBackground }]}>profile</Text>
    </View>
  );
}
