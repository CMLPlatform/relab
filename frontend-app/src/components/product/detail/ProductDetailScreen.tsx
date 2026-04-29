import { useRouter } from 'expo-router';
import { useCallback } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { ProductPageContent } from '@/components/product/detail/Content';
import { ProductFabControls } from '@/components/product/detail/FabControls';
import { ProductPageErrorState, ProductPageLoadingState } from '@/components/product/detail/States';
import { useProductPageScreen } from '@/hooks/products/useProductPageScreen';
import type { UseProductFormOptions } from '@/hooks/useProductForm';
import { isProductNotFoundError } from '@/services/api/products';

function useFabPressHandler({
  saveAndExit,
  editMode,
  isNew,
}: {
  saveAndExit: () => void;
  editMode: boolean;
  isNew: boolean;
}) {
  const router = useRouter();
  return useCallback(() => {
    // View mode on an existing entity → flip the ?edit=1 query param on the
    // same screen. Keeps the component mounted so scroll position and fetched
    // data survive the transition. New drafts and existing edit sessions go
    // through saveAndExit directly.
    if (!editMode && !isNew) {
      router.setParams({ edit: '1' });
      return;
    }
    saveAndExit();
  }, [editMode, isNew, router, saveAndExit]);
}

export function ProductDetailScreen({ formOptions }: { formOptions: UseProductFormOptions }) {
  const { theme, screen, editing, streaming, capabilities, actions } =
    useProductPageScreen(formOptions);

  const onPrimaryFabPress = useFabPressHandler({
    saveAndExit: actions.saveAndExit,
    editMode: editing.editMode,
    isNew: capabilities.isNew,
  });

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
        entityRole={formOptions.role}
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

  if (!(screen.product.id || capabilities.isNew)) {
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
      />
      <ProductFabControls
        entityRole={screen.product.role}
        editMode={editing.editMode}
        ownedByMe={capabilities.ownedByMe}
        isNew={capabilities.isNew}
        productId={typeof screen.product.id === 'number' ? screen.product.id : undefined}
        productName={screen.product.name ?? ''}
        fabExtended={editing.fabExtended}
        validationError={editing.validationResult.error}
        validationValid={editing.validationResult.isValid}
        isSaving={editing.isSaving}
        isDirty={editing.isDirty}
        onPrimaryFabPress={onPrimaryFabPress}
        streamPickerVisible={streaming.streamPickerVisible}
        onDismissStreamPicker={streaming.closeStreamPicker}
        primaryFabIcon={editing.primaryFabIcon}
      />
    </>
  );
}
