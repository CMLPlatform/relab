import { useRouter } from 'expo-router';
import { useCallback, useRef } from 'react';
import type { NativeScrollEvent, NativeSyntheticEvent, ScrollView, View } from 'react-native';
import type { SectionKey } from '@/components/base/SectionNavContext';
import { SectionNavContext } from '@/components/base/SectionNavContext';
import { SectionNavLayout } from '@/components/base/SectionNavLayout';
import ProductDetailsSkeleton from '@/components/product/ProductDetailsSkeleton';
import { AmountDraftFlushContext } from '@/features/products/amountDraftFlush';
import { useProductFiles } from '@/features/products/useProductFiles';
import type { UseProductFormOptions } from '@/features/products/useProductForm';
import { useProductPageScreen } from '@/features/products/useProductPageScreen';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { useSectionNav } from '@/hooks/useSectionNav';
import { isProductNotFoundError } from '@/services/api/products';
import { ProductPageContent } from './Content';
import { visibleSections } from './content-sections';
import { ProductFabControls } from './FabControls';
import { ProductPageErrorState, ProductPageLoadingState } from './States';

function useErrorSummaryPressHandler(
  scrollTo: (key: SectionKey) => void,
  firstErrorSection: SectionKey | undefined,
) {
  return useCallback(
    () => scrollTo(firstErrorSection ?? 'overview'),
    [scrollTo, firstErrorSection],
  );
}

function useFabPressHandler({
  saveAndExit,
  editMode,
}: {
  saveAndExit: () => void;
  editMode: boolean;
}) {
  const router = useRouter();
  return useCallback(() => {
    // View mode: flip ?edit=1 on the same screen (stays mounted).
    if (!editMode) {
      router.setParams({ edit: '1' });
      return;
    }
    saveAndExit();
  }, [editMode, router, saveAndExit]);
}

/** Loading/error/unresolved-id states. Not a hook: no hook calls inside. */
function renderScreenGuard({
  screen,
  formOptions,
  theme,
  onRetry,
  onBack,
}: {
  screen: ReturnType<typeof useProductPageScreen>['screen'];
  formOptions: UseProductFormOptions;
  theme: ReturnType<typeof useProductPageScreen>['theme'];
  onRetry: () => void;
  onBack: () => void;
}) {
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
        onBack={onBack}
        onRetry={onRetry}
      />
    );
  }

  if (!screen.product.id) {
    return <ProductDetailsSkeleton />;
  }

  return null;
}

export function ProductDetailScreen({ formOptions }: { formOptions: UseProductFormOptions }) {
  const { theme, screen, editing, streaming, capabilities, actions, amountFlushRef } =
    useProductPageScreen(formOptions);
  // Same query ProductFiles reads; here it decides whether the section is offered and empty.
  const { isLab, files: researchFiles } = useProductFiles(screen.product);
  const hasResearchFiles = researchFiles.length > 0;
  const { isLg } = useBreakpoint();
  const scrollRef = useRef<ScrollView>(null);
  const nav = useSectionNav((y) => scrollRef.current?.scrollTo({ y, animated: true }));
  // One trigger for both dialogs behind "Go Live" (AppDialog's `triggerRef`).
  const goLiveTriggerRef = useRef<View>(null);

  const onPrimaryFabPress = useFabPressHandler({
    saveAndExit: actions.saveAndExit,
    editMode: editing.editMode,
  });
  const onErrorSummaryPress = useErrorSummaryPressHandler(
    nav.scrollTo,
    editing.validationResult.firstErrorSection,
  );

  const { refetch } = screen;
  const handleRetry = useCallback(() => refetch(), [refetch]);

  // FAB-collapse and scroll-spy share one onScroll.
  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      editing.onScroll(event);
      nav.onScrollSpy(event.nativeEvent.contentOffset.y);
    },
    [editing, nav],
  );

  const guard = renderScreenGuard({
    screen,
    formOptions,
    theme,
    onRetry: handleRetry,
    onBack: actions.goBackWithGuards,
  });
  if (guard) return guard;

  // Mirrors ProductVideo's showGoLiveCta/streamingThisProduct so the Media
  // section is not collapsed under an actionable CTA.
  const mediaStreamable =
    capabilities.streamingThisProduct || (capabilities.ownedByMe && capabilities.rpiEnabled);

  const navSections = visibleSections(screen.product, {
    editMode: editing.editMode,
    isProductComponent: capabilities.isProductComponent,
    isLab,
    mediaStreamable,
    hasResearchFiles,
  });

  const content = (
    <ProductPageContent
      product={screen.product}
      editMode={editing.editMode}
      isProductComponent={capabilities.isProductComponent}
      isLab={isLab}
      mediaStreamable={mediaStreamable}
      hasResearchFiles={hasResearchFiles}
      scrollRef={scrollRef}
      onScroll={handleScroll}
      onImagesChange={actions.onImagesChange}
      onProductNameChange={actions.onProductNameChange}
      onChangeDescription={actions.onChangeDescription}
      onBrandChange={actions.onBrandChange}
      onModelChange={actions.onModelChange}
      onAmountInParentChange={actions.onAmountInParentChange}
      onTypeChange={actions.onTypeChange}
      onChangePhysicalProperties={actions.onChangePhysicalProperties}
      onChangeCircularityProperties={actions.onChangeCircularityProperties}
      onVideoChange={actions.onVideoChange}
      onProductDelete={actions.onProductDelete}
      onGoLivePress={streaming.openStreamPicker}
      goLiveTriggerRef={goLiveTriggerRef}
    />
  );

  return (
    <AmountDraftFlushContext.Provider value={amountFlushRef}>
      <SectionNavContext.Provider value={nav}>
        <SectionNavLayout
          isLg={isLg}
          navSections={navSections}
          activeKey={nav.activeKey}
          onPressSection={nav.scrollTo}
        >
          {content}
        </SectionNavLayout>
        <ProductFabControls
          entityRole={screen.product.role}
          editMode={editing.editMode}
          ownedByMe={capabilities.ownedByMe}
          productId={typeof screen.product.id === 'number' ? screen.product.id : undefined}
          productName={screen.product.name ?? ''}
          fabExtended={editing.fabExtended}
          validationError={editing.validationResult.error}
          validationValid={editing.validationResult.isValid}
          errorCount={editing.validationResult.errorCount}
          onErrorSummaryPress={onErrorSummaryPress}
          isSaving={editing.isSaving}
          isPaused={editing.isPaused}
          isDirty={editing.isDirty}
          onPrimaryFabPress={onPrimaryFabPress}
          streamPickerVisible={streaming.streamPickerVisible}
          onDismissStreamPicker={streaming.closeStreamPicker}
          primaryFabIcon={editing.primaryFabIcon}
          streamTriggerRef={goLiveTriggerRef}
        />
      </SectionNavContext.Provider>
    </AmountDraftFlushContext.Provider>
  );
}
