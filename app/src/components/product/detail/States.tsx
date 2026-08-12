import { View } from 'react-native';
import { AppButton } from '@/components/base/AppButton';
import { AppText } from '@/components/base/AppText';
import { Card } from '@/components/base/Card';
import { Icon } from '@/components/base/Icon';
import ProductDetailsSkeleton from '@/components/product/ProductDetailsSkeleton';
import { entityLabel, entityLabelTitle } from '@/types/Product';
import { getErrorMessage } from '@/utils/errors';

type ProductPageErrorStateProps = {
  entityRole: 'product' | 'component';
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
  entityRole,
  error,
  isNotFound,
  onBack,
  onRetry,
  themeColors,
}: ProductPageErrorStateProps) {
  const entity = entityLabel({ role: entityRole });
  const entityTitle = entityLabelTitle({ role: entityRole });

  if (isNotFound) {
    return (
      <View style={styles.centerState}>
        <Icon name="package-x" size={64} color={themeColors.onSurfaceVariant} />
        <AppText variant="title" style={styles.centerText}>
          {entityTitle} not found
        </AppText>
        <AppText style={styles.subtleCenterText}>
          This {entity} may have been removed or the link is no longer valid.
        </AppText>
        <AppButton variant="primary" onPress={onBack} className="mt-2">
          Back to products
        </AppButton>
      </View>
    );
  }

  return (
    <View style={styles.centerState}>
      <Icon name="circle-alert" size={64} color={themeColors.error} />
      <AppText variant="title" style={styles.centerText}>
        Something went wrong
      </AppText>
      <AppText style={styles.subtleCenterText}>
        {getErrorMessage(error, `Couldn't load the ${entity} details.`)}
      </AppText>
      <AppButton variant="primary" onPress={onRetry} className="mt-2">
        Try again
      </AppButton>
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
            <AppText style={{ fontSize: 12 }}>
              This is taking longer than usual. Please wait…
            </AppText>
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
