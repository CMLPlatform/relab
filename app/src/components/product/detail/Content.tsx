import type { ComponentProps, RefObject } from 'react';
import { useContext } from 'react';
import type { NativeScrollEvent, NativeSyntheticEvent, ScrollView } from 'react-native';
import { View } from 'react-native';
import {
  KeyboardAwareScrollView,
  type KeyboardAwareScrollViewRef,
} from 'react-native-keyboard-controller';
import { AppText } from '@/components/base/AppText';
import { PageContainer } from '@/components/base/PageContainer';
import { Section } from '@/components/base/Section';
import { SectionNavContext } from '@/components/base/SectionNavContext';
import { ExportMenu } from '@/components/product/ExportMenu';
import ProductDelete from '@/components/product/ProductDelete';
import ProductImageGallery from '@/components/product/ProductImageGallery';
import { type MissingField, missingFields } from '@/features/products/missingFields';
import { useAnchoredSectionNav } from '@/hooks/useAnchoredSectionNav';
import type { Product } from '@/types/Product';
import type { SectionContext, SectionRenderProps } from './content-sections';
import { guardedSections, isSectionShown } from './content-sections';
import { MissingFieldsNotice } from './MissingFieldsNotice';
import ProductMetaData from './ProductMetaData';
import { SpecHeader } from './SpecHeader';

type ProductPageContentProps = {
  product: Product;
  editMode: boolean;
  /** False while a superuser moderates someone else's product: fields and deletes only, no new content. */
  canEdit: boolean;
  /** True while a superuser edits a product they do not own; shows the ownership notice. */
  editingOthersProduct: boolean;
  /** Gates the missing-data checklist: shown to the owner only, never to a moderating superuser. */
  ownedByMe?: boolean;
  /** "Saved · ID 29" style line under the title (edit mode only). */
  saveStatus?: string;
  isProductComponent: boolean;
  isLab: boolean;
  mediaStreamable: boolean;
  hasResearchFiles: boolean;
  scrollRef: RefObject<ScrollView | null>;
  onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  onImagesChange: ComponentProps<typeof ProductImageGallery>['onImagesChange'];
  onProductNameChange: ComponentProps<typeof SpecHeader>['onNameChange'];
  onChangeDescription: SectionRenderProps['onChangeDescription'];
  onBrandChange: SectionRenderProps['onBrandChange'];
  onModelChange: SectionRenderProps['onModelChange'];
  onAmountInParentChange: SectionRenderProps['onAmountInParentChange'];
  onTypeChange: SectionRenderProps['onTypeChange'];
  onChangePhysicalProperties: SectionRenderProps['onChangePhysicalProperties'];
  onChangeCircularityProperties: SectionRenderProps['onChangeCircularityProperties'];
  onVideoChange: SectionRenderProps['onVideoChange'];
  onProductDelete: () => void;
  onGoLivePress: () => void;
  goLiveTriggerRef?: RefObject<View | null>;
  /** Enters edit mode (the `?edit=1` route param); used to make a missing-field link
   * useful when its section is currently collapsed out of view mode. */
  enterEditMode: () => void;
};

export function ProductPageContent({
  product,
  editMode,
  canEdit,
  editingOthersProduct,
  ownedByMe = false,
  saveStatus,
  isProductComponent,
  isLab,
  mediaStreamable,
  hasResearchFiles,
  scrollRef,
  onScroll,
  onImagesChange,
  onProductNameChange,
  onChangeDescription,
  onBrandChange,
  onModelChange,
  onAmountInParentChange,
  onTypeChange,
  onChangePhysicalProperties,
  onChangeCircularityProperties,
  onVideoChange,
  onProductDelete,
  onGoLivePress,
  goLiveTriggerRef,
  enterEditMode,
}: ProductPageContentProps) {
  const outerNav = useContext(SectionNavContext);
  const {
    value: anchoredNav,
    onPageContainerLayout,
    onSectionsWrapperLayout,
  } = useAnchoredSectionNav(outerNav);

  const ctx: SectionContext = { mediaStreamable, hasResearchFiles, editMode, canEdit };

  const missing = ownedByMe ? missingFields(product) : [];
  const shownSections = guardedSections({ isProductComponent, isLab }).filter((section) =>
    isSectionShown(section, product, ctx),
  );
  const onPressMissingField = (field: MissingField) => {
    if (field.target === 'gallery') {
      scrollRef.current?.scrollTo({ y: 0, animated: true });
      return;
    }
    // A section that view mode collapses (e.g. an empty Overview) has nothing to
    // scroll to; edit mode is what shows it.
    if (!editMode && !shownSections.some((section) => section.key === field.target)) {
      enterEditMode();
      return;
    }
    anchoredNav?.scrollTo(field.target);
  };

  const sectionProps: SectionRenderProps = {
    product,
    editMode,
    canEdit,
    isProductComponent,
    onChangeDescription,
    onBrandChange,
    onModelChange,
    onAmountInParentChange,
    onTypeChange,
    onChangePhysicalProperties,
    onChangeCircularityProperties,
    onVideoChange,
    onGoLivePress,
    goLiveTriggerRef,
  };

  return (
    <KeyboardAwareScrollView
      // KeyboardAwareScrollView forwards the real ScrollView instance; the two
      // ref shapes are runtime-compatible.
      ref={scrollRef as unknown as RefObject<KeyboardAwareScrollViewRef>}
      contentContainerStyle={{ gap: 15, paddingBottom: 5 }}
      onScroll={onScroll}
      scrollEventThrottle={16}
    >
      <PageContainer onLayout={onPageContainerLayout}>
        {/* Full bleed on a phone (cancelling the base px-4 gutter); from md up the
            photo keeps the content column's edges, so it, the title and the
            section cards start on one line. */}
        <View className="-mx-4 mb-4 md:mx-0">
          <ProductImageGallery
            product={product}
            editMode={editMode}
            canEdit={canEdit}
            onImagesChange={onImagesChange}
          />
        </View>
        <View style={{ gap: 15 }} onLayout={onSectionsWrapperLayout}>
          {editingOthersProduct ? (
            <View
              testID="editing-others-product-notice"
              className="rounded-lg border border-border bg-muted px-4 py-2"
            >
              {/* Static notice shown with edit mode, not a status change: no live region. */}
              <AppText variant="caption" className="text-muted-foreground">
                You are moderating someone else's product. You can correct details or remove
                content.
              </AppText>
            </View>
          ) : null}
          <SpecHeader
            product={product}
            editMode={editMode}
            saveStatus={saveStatus}
            onNameChange={onProductNameChange}
          />
          <MissingFieldsNotice
            fields={missing}
            // biome-ignore lint/performance/noJsxPropsBind: `missing` is a new array every render, so a stable handler would not save a rerender.
            onPressField={onPressMissingField}
          />
          <SectionNavContext.Provider value={anchoredNav}>
            {shownSections.map((section) => (
              <Section
                key={section.key}
                title={section.label}
                sectionKey={section.key}
                isEmpty={section.isEmpty(product, ctx)}
                editMode={editMode}
                addLabel={section.addLabel}
                titleSuffix={section.titleSuffix?.(product)}
                tooltip={section.tooltip?.(product, editMode)}
              >
                {section.render(sectionProps)}
              </Section>
            ))}
          </SectionNavContext.Provider>
          {/* Record metadata (dates, owner, id) is a footer, not a chunk of
              the record; keeping it out of the nav is what lets the chips
              fit one row on a phone. */}
          <ProductMetaData product={product} />
          {/* Exports cover a whole product tree, so only base products offer one. */}
          {product.role === 'product' && typeof product.id === 'number' && !editMode ? (
            <View className="mb-2 flex-row">
              <ExportMenu label="Export" productId={product.id} />
            </View>
          ) : null}
          <ProductDelete product={product} editMode={editMode} onDelete={onProductDelete} />
        </View>
      </PageContainer>
    </KeyboardAwareScrollView>
  );
}
