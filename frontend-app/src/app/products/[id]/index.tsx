import { ActivityIndicator, View } from 'react-native';
import {
  ProductFabControls,
  ProductPageContent,
  ProductPageErrorState,
  ProductPageLoadingState,
} from '@/components/product/ProductPageSections';
import { useProductPageScreen } from '@/hooks/useProductPageScreen';
import { isProductNotFoundError } from '@/services/api/products';

export default function ProductPage() {
  const { theme, screen, editing, streaming, capabilities, actions } = useProductPageScreen();

  if (screen.isLoading) {
    return (
      <ProductPageLoadingState
        slowLoading={screen.slowLoading}
        surfaceVariant={theme.colors.surfaceVariant}
      />
    );
  }

  if (screen.isError) {
    return (
      <ProductPageErrorState
        error={screen.error}
        isNotFound={isProductNotFoundError(screen.error)}
        onBack={actions.goBackWithGuards}
        onRetry={() => screen.refetch()}
        themeColors={{
          error: theme.colors.error,
          onSurfaceVariant: theme.colors.onSurfaceVariant,
        }}
      />
    );
  }

  if (!screen.product.id && !capabilities.isNew) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <>
      <ProductPageContent
        product={screen.product}
        editMode={editing.editMode}
        isNew={capabilities.isNew}
        isProductComponent={capabilities.isProductComponent}
        justCreated={capabilities.justCreated}
        onScroll={editing.onScroll}
        onNavigateToProfile={actions.goToProfileForYouTubeSetup}
        onNavigateToActiveStream={actions.goToActiveStreamProduct}
        onImagesChange={actions.onImagesChange}
        onChangeDescription={actions.onChangeDescription}
        onBrandChange={actions.onBrandChange}
        onModelChange={actions.onModelChange}
        onAmountInParentChange={actions.onAmountInParentChange}
        onTypeChange={actions.onTypeChange}
        onChangePhysicalProperties={actions.onChangePhysicalProperties}
        onChangeCircularityProperties={actions.onChangeCircularityProperties}
        onVideoChange={actions.onVideoChange}
        onProductDelete={actions.onProductDelete}
        rpiEnabled={capabilities.rpiEnabled}
        youtubeEnabled={capabilities.youtubeEnabled}
        isGoogleLinked={capabilities.isGoogleLinked}
        streamingThisProduct={streaming.streamingThisProduct}
        streamingOtherProduct={streaming.streamingOtherProduct}
        activeStream={streaming.activeStream}
        onGoLivePress={streaming.openStreamPicker}
        themeColors={{
          secondaryContainer: theme.colors.secondaryContainer,
          onSecondaryContainer: theme.colors.onSecondaryContainer,
          surfaceVariant: theme.colors.surfaceVariant,
          onSurfaceVariant: theme.colors.onSurfaceVariant,
        }}
      />
      <ProductFabControls
        editMode={editing.editMode}
        ownedByMe={capabilities.ownedByMe}
        productId={typeof screen.product.id === 'number' ? screen.product.id : undefined}
        productName={screen.product.name ?? ''}
        fabExtended={editing.fabExtended}
        validationError={editing.validationResult.error}
        validationValid={editing.validationResult.isValid}
        isSaving={editing.isSaving}
        onPrimaryFabPress={actions.toggleEditMode}
        streamPickerVisible={streaming.streamPickerVisible}
        onDismissStreamPicker={streaming.closeStreamPicker}
        primaryFabIcon={editing.primaryFabIcon}
      />
    </>
  );
}
