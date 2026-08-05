import type { ComponentProps, RefObject } from 'react';
import { useContext } from 'react';
import type { NativeScrollEvent, NativeSyntheticEvent, ScrollView } from 'react-native';
import { View } from 'react-native';
import {
  KeyboardAwareScrollView,
  type KeyboardAwareScrollViewRef,
} from 'react-native-keyboard-controller';
import { PageContainer } from '@/components/base/PageContainer';
import { Section } from '@/components/base/Section';
import { SectionNavContext } from '@/components/base/SectionNavContext';
import ProductDelete from '@/components/product/ProductDelete';
import ProductImageGallery from '@/components/product/ProductImageGallery';
import { useAnchoredSectionNav } from '@/hooks/useAnchoredSectionNav';
import type { Product } from '@/types/Product';
import type { SectionContext, SectionRenderProps } from './content-sections';
import { guardedSections } from './content-sections';
import { SpecHeader } from './SpecHeader';

type ProductPageContentProps = {
  product: Product;
  editMode: boolean;
  isProductComponent: boolean;
  mediaStreamable: boolean;
  scrollRef: RefObject<ScrollView | null>;
  onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  onImagesChange: ComponentProps<typeof ProductImageGallery>['onImagesChange'];
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
  isProductComponent,
  mediaStreamable,
  scrollRef,
  onScroll,
  onImagesChange,
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

  const ctx: SectionContext = { mediaStreamable };
  const sectionProps: SectionRenderProps = {
    product,
    editMode,
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
      // KeyboardAwareScrollView forwards the real underlying ScrollView instance
      // (see react-native-keyboard-controller source) with one extra method
      // glued on; callers hold a plain ScrollView ref for scrollTo, so bridge
      // the two ref shapes through `unknown` (they're runtime-compatible).
      ref={scrollRef as unknown as RefObject<KeyboardAwareScrollViewRef>}
      contentContainerStyle={{ gap: 15, paddingBottom: 5 }}
      onScroll={onScroll}
      scrollEventThrottle={16}
    >
      <PageContainer fullBleed>
        <ProductImageGallery
          product={product}
          editMode={editMode}
          onImagesChange={onImagesChange}
        />
      </PageContainer>
      <PageContainer onLayout={onPageContainerLayout}>
        <View style={{ gap: 15 }} onLayout={onSectionsWrapperLayout}>
          <SpecHeader product={product} />
          <SectionNavContext.Provider value={anchoredNav}>
            {guardedSections({ isProductComponent }).map((section) => (
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
          <ProductDelete product={product} editMode={editMode} onDelete={onProductDelete} />
        </View>
      </PageContainer>
    </KeyboardAwareScrollView>
  );
}
