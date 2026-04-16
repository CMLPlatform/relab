import type { ComponentProps } from 'react';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { Card, Text } from 'react-native-paper';
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
import type { StreamSession } from '@/context/StreamSessionContext';
import type { Product } from '@/types/Product';

type ProductPageContentProps = {
  product: Product;
  editMode: boolean;
  isNew: boolean;
  isProductComponent: boolean;
  justCreated: boolean;
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
  activeStream: StreamSession | null;
  onGoLivePress: () => void;
  themeColors: {
    secondaryContainer: string;
    onSecondaryContainer: string;
    surfaceVariant: string;
    onSurfaceVariant: string;
  };
};

export function ProductPageContent({
  product,
  editMode,
  isNew,
  isProductComponent,
  justCreated,
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
  activeStream,
  onGoLivePress,
  themeColors,
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
        />
      </DetailCard>
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
        <>
          {justCreated ? (
            <Card
              style={{ marginHorizontal: 14, backgroundColor: themeColors.secondaryContainer }}
              mode="contained"
            >
              <Card.Content>
                <Text variant="bodyMedium" style={{ color: themeColors.onSecondaryContainer }}>
                  Product saved! Want to track sub-components (e.g. battery, screen)? Use the
                  &quot;Add component&quot; button below.
                </Text>
              </Card.Content>
            </Card>
          ) : null}
          <DetailCard>
            <ProductComponents product={product} editMode={editMode} />
          </DetailCard>
        </>
      ) : null}
      <DetailCard>
        <ProductMetaData product={product} />
      </DetailCard>
      <ProductDelete product={product} editMode={editMode} onDelete={onProductDelete} />
    </KeyboardAwareScrollView>
  );
}
