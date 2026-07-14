import type { ComponentProps, RefObject } from 'react';
import type { NativeScrollEvent, NativeSyntheticEvent, ScrollView } from 'react-native';
import { View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { PageContainer } from '@/components/base/PageContainer';
import { Section } from '@/components/base/Section';
import ProductDelete from '@/components/product/ProductDelete';
import ProductImageGallery from '@/components/product/ProductImageGallery';
import type { Product } from '@/types/Product';
import type { SectionContext, SectionRenderProps } from './content-sections';
import { guardedSections } from './content-sections';
import { SpecHeader } from './SpecHeader';

type ProductPageContentProps = {
  product: Product;
  editMode: boolean;
  isNew: boolean;
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
};

export function ProductPageContent({
  product,
  editMode,
  isNew,
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
}: ProductPageContentProps) {
  const ctx: SectionContext = { mediaStreamable };
  const sectionProps: SectionRenderProps = {
    product,
    editMode,
    isNew,
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
  };

  return (
    <KeyboardAwareScrollView
      // KeyboardAwareScrollView forwards the real underlying ScrollView instance
      // (see react-native-keyboard-controller source) with one extra method
      // glued on; the plain ScrollView ref type is what callers need for scrollTo.
      ref={scrollRef as never}
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
      <PageContainer>
        <View style={{ gap: 15 }}>
          <SpecHeader product={product} />
          {guardedSections({ isNew, isProductComponent }).map((section) => (
            <Section
              key={section.key}
              title={section.label}
              sectionKey={section.key}
              isEmpty={section.isEmpty(product, ctx)}
              editMode={editMode}
              addLabel={section.addLabel}
            >
              {section.render(sectionProps)}
            </Section>
          ))}
          <ProductDelete product={product} editMode={editMode} onDelete={onProductDelete} />
        </View>
      </PageContainer>
    </KeyboardAwareScrollView>
  );
}
