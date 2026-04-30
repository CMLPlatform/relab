import type { ComponentProps } from 'react';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import DetailCard from '@/components/common/DetailCard';
import ProductCircularityProperties from '@/components/product/ProductCircularityProperties';
import ProductComponents from '@/components/product/ProductComponents';
import ProductDelete from '@/components/product/ProductDelete';
import ProductDescription from '@/components/product/ProductDescription';
import ProductImageGallery from '@/components/product/ProductImageGallery';
import ProductMetaData from '@/components/product/ProductMetaData';
import ProductPhysicalProperties from '@/components/product/ProductPhysicalProperties';
import ProductTags from '@/components/product/ProductTags';
import ProductType from '@/components/product/ProductType';
import ProductVideo from '@/components/product/ProductVideo';
import type { StreamSession } from '@/context/streamSession';
import type { Product } from '@/types/Product';

type ProductPageContentProps = {
  product: Product;
  editMode: boolean;
  isNew: boolean;
  isProductComponent: boolean;
  onScroll: ComponentProps<typeof KeyboardAwareScrollView>['onScroll'];
  onNavigateToProfile: () => void;
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
  rpiEnabled: boolean;
  youtubeEnabled: boolean;
  isGoogleLinked: boolean;
  streamingThisProduct: boolean;
  streamingOtherProduct: boolean;
  activeStream: StreamSession | null;
  onGoLivePress: () => void;
  onNavigateToActiveStream: () => void;
};

export function ProductPageContent({
  product,
  editMode,
  isNew,
  isProductComponent,
  onScroll,
  onNavigateToProfile,
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
  rpiEnabled,
  youtubeEnabled,
  isGoogleLinked,
  streamingThisProduct,
  streamingOtherProduct,
  activeStream,
  onGoLivePress,
  onNavigateToActiveStream,
}: ProductPageContentProps) {
  return (
    <KeyboardAwareScrollView
      contentContainerStyle={{ gap: 15, paddingBottom: 5 }}
      onScroll={onScroll as never}
      scrollEventThrottle={16}
    >
      <ProductImageGallery
        product={product}
        editMode={editMode}
        onImagesChange={onImagesChange as never}
      />
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
            onVideoChange={onVideoChange}
            streamingThisProduct={streamingThisProduct}
            activeStream={activeStream}
            rpiEnabled={rpiEnabled}
            youtubeEnabled={youtubeEnabled}
            isGoogleLinked={isGoogleLinked}
            ownedByMe={product.ownedBy === 'me'}
            isNew={isNew}
            isProductComponent={isProductComponent}
            onGoLivePress={onGoLivePress}
            onNavigateToProfile={onNavigateToProfile}
            streamingOtherProduct={streamingOtherProduct}
            onNavigateToActiveStream={onNavigateToActiveStream}
          />
        </DetailCard>
      ) : null}
      <DetailCard>
        <ProductPhysicalProperties
          product={product}
          editMode={editMode}
          onChangePhysicalProperties={onChangePhysicalProperties as never}
        />
      </DetailCard>
      <DetailCard>
        <ProductCircularityProperties
          product={product}
          editMode={editMode}
          onChangeCircularityProperties={onChangeCircularityProperties as never}
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
