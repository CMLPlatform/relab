import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { useCallback, useRef } from 'react';
import type { NativeScrollEvent, NativeSyntheticEvent, ScrollView } from 'react-native';
import { ActivityIndicator, View } from 'react-native';
import { SectionNav } from '@/components/base/SectionNav';
import type { SectionKey } from '@/components/base/SectionNavContext';
import { SectionNavContext } from '@/components/base/SectionNavContext';
import type { UseProductFormOptions } from '@/features/products/useProductForm';
import { useProductPageScreen } from '@/features/products/useProductPageScreen';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { useSectionNav } from '@/hooks/useSectionNav';
import { isProductNotFoundError } from '@/services/api/products';
import { ProductPageContent } from './Content';
import { visibleSections } from './content-sections';
import { ProductFabControls } from './FabControls';
import { ProductPageErrorState, ProductPageLoadingState } from './States';

/** Phone: chips row pinned above the scroll. ≥lg web: fixed outline column beside it. */
function SectionNavLayout({
  isLg,
  navSections,
  activeKey,
  onPressSection,
  children,
}: {
  isLg: boolean;
  navSections: { key: SectionKey; label: string }[];
  activeKey: SectionKey;
  onPressSection: (key: SectionKey) => void;
  children: ReactNode;
}) {
  if (isLg) {
    return (
      <View style={{ flex: 1, flexDirection: 'row' }}>
        <View testID="section-nav-outline" style={{ width: 200, padding: 16 }}>
          <SectionNav
            sections={navSections}
            activeKey={activeKey}
            onPress={onPressSection}
            orientation="outline"
          />
        </View>
        <View style={{ flex: 1 }}>{children}</View>
      </View>
    );
  }
  return (
    <View style={{ flex: 1 }}>
      <View testID="section-nav-chips">
        <SectionNav
          sections={navSections}
          activeKey={activeKey}
          onPress={onPressSection}
          orientation="chips"
        />
      </View>
      {children}
    </View>
  );
}

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
    // View mode → flip the ?edit=1 query param on the same screen. Keeps the
    // component mounted so scroll position and fetched data survive the
    // transition. An active edit session goes through saveAndExit directly.
    if (!editMode) {
      router.setParams({ edit: '1' });
      return;
    }
    saveAndExit();
  }, [editMode, router, saveAndExit]);
}

export function ProductDetailScreen({ formOptions }: { formOptions: UseProductFormOptions }) {
  const { theme, screen, editing, streaming, capabilities, actions } =
    useProductPageScreen(formOptions);
  const { isLg } = useBreakpoint();
  const scrollRef = useRef<ScrollView>(null);
  const nav = useSectionNav((y) => scrollRef.current?.scrollTo({ y, animated: true }));

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

  // Composes the pre-existing FAB-collapse scroll handler with scroll-spy so
  // both can drive off one onScroll prop on the underlying ScrollView.
  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      editing.onScroll(event);
      nav.onScrollSpy(event.nativeEvent.contentOffset.y);
    },
    [editing, nav],
  );

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
        onRetry={handleRetry}
        themeColors={{
          error: theme.colors.error,
          onSurfaceVariant: theme.colors.onSurfaceVariant,
        }}
      />
    );
  }

  if (!screen.product.id) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  // Approximates "this section can show a live-media affordance" as
  // go-live-eligible (owned + rpi camera) OR currently streaming — mirrors
  // ProductVideo's own showGoLiveCta/streamingThisProduct checks so the
  // Media section isn't collapsed out from under an actionable CTA.
  const mediaStreamable =
    capabilities.streamingThisProduct || (capabilities.ownedByMe && capabilities.rpiEnabled);

  const navSections = visibleSections(screen.product, {
    editMode: editing.editMode,
    isProductComponent: capabilities.isProductComponent,
    mediaStreamable,
  });

  const content = (
    <ProductPageContent
      product={screen.product}
      editMode={editing.editMode}
      isProductComponent={capabilities.isProductComponent}
      mediaStreamable={mediaStreamable}
      scrollRef={scrollRef}
      onScroll={handleScroll}
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
      onGoLivePress={streaming.openStreamPicker}
    />
  );

  return (
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
        isDirty={editing.isDirty}
        onPrimaryFabPress={onPrimaryFabPress}
        streamPickerVisible={streaming.streamPickerVisible}
        onDismissStreamPicker={streaming.closeStreamPicker}
        primaryFabIcon={editing.primaryFabIcon}
      />
    </SectionNavContext.Provider>
  );
}
