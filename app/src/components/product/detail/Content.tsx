import type { ComponentProps, RefObject } from 'react';
import { useCallback, useContext } from 'react';
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
}: ProductPageContentProps) {
  const outerNav = useContext(SectionNavContext);
  const {
    value: anchoredNav,
    onPageContainerLayout,
    onSectionsWrapperLayout,
  } = useAnchoredSectionNav(outerNav);

  const missing = ownedByMe ? missingFields(product) : [];
  const onPressMissingField = useCallback(
    (field: MissingField) => {
      if (field.target === 'gallery') {
        scrollRef.current?.scrollTo({ y: 0, animated: true });
        return;
      }
      anchoredNav?.scrollTo(field.target);
    },
    [anchoredNav, scrollRef],
  );

  const ctx: SectionContext = { mediaStreamable, hasResearchFiles, editMode, canEdit };
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
      <PageContainer fullBleed>
        <ProductImageGallery
          product={product}
          editMode={editMode}
          canEdit={canEdit}
          onImagesChange={onImagesChange}
        />
      </PageContainer>
      <PageContainer onLayout={onPageContainerLayout}>
        <View style={{ gap: 15 }} onLayout={onSectionsWrapperLayout}>
          {editingOthersProduct ? (
            <View
              testID="editing-others-product-notice"
              className="rounded-lg border border-border bg-muted px-4 py-2"
            >
              <AppText
                variant="caption"
                accessibilityLiveRegion="polite"
                className="text-muted-foreground"
              >
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
          <MissingFieldsNotice fields={missing} onPressField={onPressMissingField} />
          <SectionNavContext.Provider value={anchoredNav}>
            {guardedSections({ isProductComponent, isLab })
              .filter((section) => isSectionShown(section, product, ctx))
              .map((section) => (
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
          <ProductDelete product={product} editMode={editMode} onDelete={onProductDelete} />
        </View>
      </PageContainer>
    </KeyboardAwareScrollView>
  );
}
