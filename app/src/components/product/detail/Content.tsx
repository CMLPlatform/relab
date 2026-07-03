import type { ComponentProps } from 'react';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import DetailCard from '@/components/base/DetailCard';
import ProductCircularityProperties from '@/components/product/detail/ProductCircularityProperties';
import ProductComponents from '@/components/product/detail/ProductComponents';
import ProductMetaData from '@/components/product/detail/ProductMetaData';
import ProductPhysicalProperties from '@/components/product/detail/ProductPhysicalProperties';
import ProductTags from '@/components/product/detail/ProductTags';
import ProductType from '@/components/product/detail/ProductType';
import ProductDelete from '@/components/product/ProductDelete';
import ProductDescription from '@/components/product/ProductDescription';
import ProductImageGallery from '@/components/product/ProductImageGallery';
import ProductVideo from '@/components/product/ProductVideo';
import type { Product } from '@/types/Product';

type ProductPageContentProps = {
  product: Product;
  editMode: boolean;
  isNew: boolean;
  isProductComponent: boolean;
  onScroll: ComponentProps<typeof KeyboardAwareScrollView>['onScroll'];
  onImagesChange: ComponentProps<typeof ProductImageGallery>['onImagesChange'];
  onChangeDescription: ComponentProps<typeof ProductDescription>['onChangeDescription'];
  onBrandChange: ComponentProps<typeof ProductTags>['onBrandChange'];
  onModelChange: ComponentProps<typeof ProductTags>['onModelChange'];
  onAmountInParentChange: ComponentProps<typeof ProductTags>['onAmountChange'];
  onTypeChange: ComponentProps<typeof ProductType>['onTypeChange'];
  onChangePhysicalProperties: ComponentProps<
    typeof ProductPhysicalProperties
  >['onChangePhysicalProperties'];
  onChangeCircularityProperties: ComponentProps<
    typeof ProductCircularityProperties
  >['onChangeCircularityProperties'];
  onVideoChange: ComponentProps<typeof ProductVideo>['onVideoChange'];
  onProductDelete: () => void;
  onGoLivePress: () => void;
};

export function ProductPageContent({
  product,
  editMode,
  isNew,
  isProductComponent,
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
  return (
    <KeyboardAwareScrollView
      contentContainerStyle={{ gap: 15, paddingBottom: 5 }}
      onScroll={onScroll}
      scrollEventThrottle={16}
    >
      <ProductImageGallery product={product} editMode={editMode} onImagesChange={onImagesChange} />
      <DetailCard>
        <ProductDescription
          product={product}
          editMode={editMode}
          onChangeDescription={onChangeDescription}
        />
      </DetailCard>
      <ProductTags
        product={product}
        editMode={editMode}
        onBrandChange={onBrandChange}
        onModelChange={onModelChange}
        onAmountChange={onAmountInParentChange}
        isComponent={isProductComponent}
      />
      <DetailCard>
        <ProductType product={product} editMode={editMode} onTypeChange={onTypeChange} />
      </DetailCard>
      {!isProductComponent ? (
        <DetailCard>
          <ProductVideo
            product={product}
            editMode={editMode}
            isNew={isNew}
            onVideoChange={onVideoChange}
            onGoLivePress={onGoLivePress}
          />
        </DetailCard>
      ) : null}
      <DetailCard>
        <ProductPhysicalProperties
          product={product}
          editMode={editMode}
          onChangePhysicalProperties={onChangePhysicalProperties}
        />
      </DetailCard>
      <DetailCard>
        <ProductCircularityProperties
          product={product}
          editMode={editMode}
          onChangeCircularityProperties={onChangeCircularityProperties}
        />
      </DetailCard>
      {!isNew ? (
        <DetailCard>
          <ProductComponents product={product} editMode={editMode} />
        </DetailCard>
      ) : null}
      <DetailCard>
        <ProductMetaData product={product} />
      </DetailCard>
      <ProductDelete product={product} editMode={editMode} onDelete={onProductDelete} />
    </KeyboardAwareScrollView>
  );
}
