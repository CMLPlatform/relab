import { MaterialCommunityIcons } from '@expo/vector-icons';
import { View } from 'react-native';
import { Button, Card, Text } from 'react-native-paper';
import ProductDetailsSkeleton from '@/components/common/ProductDetailsSkeleton';

type ProductPageErrorStateProps = {
  error: unknown;
  isNotFound: boolean;
  onBack: () => void;
  onRetry: () => void;
  themeColors: {
    error: string;
    onSurfaceVariant: string;
  };
};

export function ProductPageErrorState({
  error,
  isNotFound,
  onBack,
  onRetry,
  themeColors,
}: ProductPageErrorStateProps) {
  if (isNotFound) {
    return (
      <View style={styles.centerState}>
        <MaterialCommunityIcons
          name="package-variant-closed-remove"
          size={64}
          color={themeColors.onSurfaceVariant}
        />
        <Text variant="headlineSmall" style={styles.centerText}>
          Product not found
        </Text>
        <Text variant="bodyMedium" style={styles.subtleCenterText}>
          This product may have been removed or the link is no longer valid.
        </Text>
        <Button mode="contained" onPress={onBack} style={{ marginTop: 8 }}>
          Back to products
        </Button>
      </View>
    );
  }

  return (
    <View style={styles.centerState}>
      <MaterialCommunityIcons name="alert-circle-outline" size={64} color={themeColors.error} />
      <Text variant="headlineSmall" style={styles.centerText}>
        Oops! Something went wrong
      </Text>
      <Text variant="bodyMedium" style={styles.subtleCenterText}>
        {String(error) || 'We encountered an error while loading the product details.'}
      </Text>
      <Button mode="contained" onPress={onRetry} style={{ marginTop: 8 }}>
        Try Again
      </Button>
    </View>
  );
}

export function ProductPageLoadingState({
  slowLoading,
  surfaceVariant,
}: {
  slowLoading: boolean;
  surfaceVariant: string;
}) {
  return (
    <View style={{ flex: 1 }}>
      <ProductDetailsSkeleton />
      {slowLoading ? (
        <View style={styles.slowLoadingContainer}>
          <Card
            style={{
              backgroundColor: surfaceVariant,
              paddingHorizontal: 16,
              paddingVertical: 8,
            }}
          >
            <Text variant="bodySmall">This is taking longer than usual. Please wait...</Text>
          </Card>
        </View>
      ) : null}
    </View>
  );
}

const styles = {
  centerState: {
    flex: 1,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    padding: 20,
    gap: 16,
  },
  centerText: {
    textAlign: 'center' as const,
  },
  subtleCenterText: {
    textAlign: 'center' as const,
    opacity: 0.7,
  },
  slowLoadingContainer: {
    position: 'absolute' as const,
    bottom: 100,
    left: 0,
    right: 0,
    alignItems: 'center' as const,
  },
};
