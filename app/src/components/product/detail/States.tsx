import { View } from 'react-native';
import { AppText } from '@/components/base/AppText';
import { Card } from '@/components/base/Card';
import { ErrorState } from '@/components/base/ErrorState';
import ProductDetailsSkeleton from '@/components/product/ProductDetailsSkeleton';
import { useAppTheme } from '@/theme';
import { entityLabel, entityLabelTitle } from '@/types/Product';
import { getErrorMessage } from '@/utils/errors';

type ProductPageErrorStateProps = {
  entityRole: 'product' | 'component';
  error: unknown;
  isNotFound: boolean;
  onBack: () => void;
  onRetry: () => void;
};

export function ProductPageErrorState({
  entityRole,
  error,
  isNotFound,
  onBack,
  onRetry,
}: ProductPageErrorStateProps) {
  const entity = entityLabel({ role: entityRole });
  const entityTitle = entityLabelTitle({ role: entityRole });
  const theme = useAppTheme();

  if (isNotFound) {
    return (
      <ErrorState
        icon="package-x"
        iconColor={theme.colors.onSurfaceVariant}
        title={`${entityTitle} not found`}
        message={`This ${entity} may have been removed or the link is no longer valid.`}
        actionLabel="Back to products"
        onRetry={onBack}
      />
    );
  }

  return (
    <ErrorState
      title="Something went wrong"
      message={getErrorMessage(error, `Couldn't load the ${entity} details.`)}
      actionLabel="Try again"
      onRetry={onRetry}
    />
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
            <AppText variant="caption">This is taking longer than usual. Please wait…</AppText>
          </Card>
        </View>
      ) : null}
    </View>
  );
}

const styles = {
  slowLoadingContainer: {
    position: 'absolute' as const,
    bottom: 100,
    left: 0,
    right: 0,
    alignItems: 'center' as const,
  },
};
