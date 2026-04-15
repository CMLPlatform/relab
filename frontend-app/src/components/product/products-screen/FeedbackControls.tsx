import { MaterialCommunityIcons } from '@expo/vector-icons';
import { View } from 'react-native';
import { AnimatedFAB, Button, Text, useTheme } from 'react-native-paper';
import { productsScreenStyles as styles } from './shared';
import type { ProductsErrorBannerProps, ProductsFabProps } from './types';

export function ProductsErrorBanner({ error, onRetry }: ProductsErrorBannerProps) {
  const theme = useTheme();

  if (!error) return null;

  return (
    <View
      style={[
        styles.errorBanner,
        {
          backgroundColor: theme.colors.errorContainer,
        },
      ]}
    >
      <MaterialCommunityIcons name="alert-circle-outline" size={24} color={theme.colors.error} />
      <View style={styles.errorContent}>
        <Text style={[styles.errorTitle, { color: theme.colors.onErrorContainer }]}>
          Load Failed
        </Text>
        <Text style={[styles.errorMessage, { color: theme.colors.onErrorContainer }]}>
          {String(error)}
        </Text>
      </View>
      <Button
        mode="contained-tonal"
        onPress={onRetry}
        accessibilityLabel="Retry loading products"
        compact
      >
        Retry
      </Button>
    </View>
  );
}

export function ProductsFab({ extended, isAuthenticated, highlight, onPress }: ProductsFabProps) {
  const theme = useTheme();

  return (
    <AnimatedFAB
      icon="plus"
      label="New Product"
      extended={extended}
      onPress={onPress}
      style={[
        styles.fab,
        {
          opacity: isAuthenticated ? 1 : 0.65,
          borderWidth: highlight ? 1 : 0,
          borderColor: highlight ? theme.colors.primaryContainer : 'transparent',
          shadowColor: highlight ? theme.colors.primary : undefined,
          shadowOpacity: highlight ? 0.22 : 0,
          shadowRadius: highlight ? 10 : 0,
        },
      ]}
      accessibilityLabel={isAuthenticated ? 'Create new product' : 'Sign in to create products'}
    />
  );
}
