import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { Platform, Pressable, View, type ViewStyle } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { AnimatedFAB, Button, Card, Icon, Text, Tooltip } from 'react-native-paper';
import { CameraStreamPicker } from '@/components/cameras/CameraStreamPicker';
import DetailCard from '@/components/common/DetailCard';
import ProductDetailsSkeleton from '@/components/common/ProductDetailsSkeleton';
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
import type { Product } from '@/types/Product';

type ProductPageErrorStateProps = {
  error: unknown;
  isNotFound: boolean;
  onBack: () => void;
  onRetry: () => void;
  themeColors: {
    error: string;
    onSurfaceVariant: string;
  };
};

export function ProductPageErrorState({
  error,
  isNotFound,
  onBack,
  onRetry,
  themeColors,
}: ProductPageErrorStateProps) {
  if (isNotFound) {
    return (
      <View style={styles.centerState}>
        <MaterialCommunityIcons
          name="package-variant-closed-remove"
          size={64}
          color={themeColors.onSurfaceVariant}
        />
        <Text variant="headlineSmall" style={styles.centerText}>
          Product not found
        </Text>
        <Text variant="bodyMedium" style={styles.subtleCenterText}>
          This product may have been removed or the link is no longer valid.
        </Text>
        <Button mode="contained" onPress={onBack} style={{ marginTop: 8 }}>
          Back to products
        </Button>
      </View>
    );
  }

  return (
    <View style={styles.centerState}>
      <MaterialCommunityIcons name="alert-circle-outline" size={64} color={themeColors.error} />
      <Text variant="headlineSmall" style={styles.centerText}>
        Oops! Something went wrong
      </Text>
      <Text variant="bodyMedium" style={styles.subtleCenterText}>
        {String(error) || 'We encountered an error while loading the product details.'}
      </Text>
      <Button mode="contained" onPress={onRetry} style={{ marginTop: 8 }}>
        Try Again
      </Button>
    </View>
  );
}

export function ProductPageLoadingState({
  slowLoading,
  surfaceVariant,
}: {
  slowLoading: boolean;
  surfaceVariant: string;
}) {
  return (
    <View style={{ flex: 1 }}>
      <ProductDetailsSkeleton />
      {slowLoading && (
        <View style={styles.slowLoadingContainer}>
          <Card
            style={{
              backgroundColor: surfaceVariant,
              paddingHorizontal: 16,
              paddingVertical: 8,
            }}
          >
            <Text variant="bodySmall">This is taking longer than usual. Please wait...</Text>
          </Card>
        </View>
      )}
    </View>
  );
}

type ProductPageContentProps = {
  product: Product;
  editMode: boolean;
  isNew: boolean;
  isProductComponent: boolean;
  justCreated: boolean;
  onScroll: ComponentProps<typeof KeyboardAwareScrollView>['onScroll'];
  onNavigateToActiveStream: () => void;
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
  streamingOtherProduct: boolean;
  activeStreamProductName?: string;
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
  onNavigateToActiveStream,
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
  streamingOtherProduct,
  activeStreamProductName,
  themeColors,
}: ProductPageContentProps) {
  return (
    <KeyboardAwareScrollView
      contentContainerStyle={{ gap: 15, paddingBottom: 5 }}
      onScroll={onScroll as never}
      scrollEventThrottle={16}
    >
      {rpiEnabled &&
        !isNew &&
        !editMode &&
        !isProductComponent &&
        product.ownedBy === 'me' &&
        streamingOtherProduct &&
        activeStreamProductName && (
          <ProductActiveStreamBanner
            productName={activeStreamProductName}
            onPress={onNavigateToActiveStream}
          />
        )}
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
      <DetailCard>
        <ProductVideo product={product} editMode={editMode} onVideoChange={onVideoChange} />
      </DetailCard>
      {!isNew && (
        <>
          {justCreated && (
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
          )}
          <DetailCard>
            <ProductComponents product={product} editMode={editMode} />
          </DetailCard>
        </>
      )}
      <DetailCard>
        <ProductMetaData product={product} />
      </DetailCard>
      <ProductDelete product={product} editMode={editMode} onDelete={onProductDelete} />
      {rpiEnabled &&
        !isNew &&
        !editMode &&
        !isProductComponent &&
        product.ownedBy === 'me' &&
        !youtubeEnabled && (
          <ProductYouTubeSetupBanner
            isGoogleLinked={isGoogleLinked}
            onPress={onNavigateToProfile}
            surfaceVariant={themeColors.surfaceVariant}
            onSurfaceVariant={themeColors.onSurfaceVariant}
          />
        )}
    </KeyboardAwareScrollView>
  );
}

type ProductFabControlsProps = {
  rpiEnabled: boolean;
  youtubeEnabled: boolean;
  isGoogleLinked: boolean;
  isNew: boolean;
  editMode: boolean;
  isProductComponent: boolean;
  ownedByMe: boolean;
  productId?: number;
  productName: string;
  fabExtended: boolean;
  validationError?: string;
  validationValid: boolean;
  isSaving: boolean;
  onPrimaryFabPress: () => void;
  onOpenStreamPicker: () => void;
  streamPickerVisible: boolean;
  onDismissStreamPicker: () => void;
  showGoLiveFab: boolean;
  primaryFabIcon: ComponentProps<typeof AnimatedFAB>['icon'];
};

export function ProductFabControls({
  rpiEnabled,
  youtubeEnabled,
  isGoogleLinked,
  isNew,
  editMode,
  isProductComponent,
  ownedByMe,
  productId,
  productName,
  fabExtended,
  validationError,
  validationValid,
  isSaving,
  onPrimaryFabPress,
  onOpenStreamPicker,
  streamPickerVisible,
  onDismissStreamPicker,
  showGoLiveFab,
  primaryFabIcon,
}: ProductFabControlsProps) {
  if (showGoLiveFab && productId) {
    return (
      <>
        {rpiEnabled &&
          youtubeEnabled &&
          isGoogleLinked &&
          !isNew &&
          !editMode &&
          !isProductComponent &&
          ownedByMe && (
            <AnimatedFAB
              icon="youtube"
              label="Go Live"
              extended={fabExtended}
              onPress={onOpenStreamPicker}
              style={styles.leftFab}
            />
          )}
        <PrimaryProductFab
          icon={primaryFabIcon}
          onPress={onPrimaryFabPress}
          fabExtended={fabExtended}
          validationError={validationError}
          validationValid={validationValid}
          isSaving={isSaving}
          ownedByMe={ownedByMe}
          editMode={editMode}
        />
        <CameraStreamPicker
          productId={productId}
          productName={productName}
          visible={streamPickerVisible}
          onDismiss={onDismissStreamPicker}
        />
      </>
    );
  }

  return (
    <PrimaryProductFab
      icon={primaryFabIcon}
      onPress={onPrimaryFabPress}
      fabExtended={fabExtended}
      validationError={validationError}
      validationValid={validationValid}
      isSaving={isSaving}
      ownedByMe={ownedByMe}
      editMode={editMode}
    />
  );
}

function PrimaryProductFab({
  icon,
  onPress,
  fabExtended,
  validationError,
  validationValid,
  isSaving,
  ownedByMe,
  editMode,
}: {
  icon: ComponentProps<typeof AnimatedFAB>['icon'];
  onPress: () => void;
  fabExtended: boolean;
  validationError?: string;
  validationValid: boolean;
  isSaving: boolean;
  ownedByMe: boolean;
  editMode: boolean;
}) {
  const fab = (
    <AnimatedFAB
      icon={icon}
      onPress={onPress}
      style={styles.rightFab}
      disabled={(editMode && !validationValid) || isSaving}
      extended={fabExtended}
      label={editMode ? 'Save Product' : 'Edit Product'}
      visible={ownedByMe}
    />
  );

  if (editMode && validationError) {
    return (
      <Tooltip title={validationError} enterTouchDelay={0} leaveTouchDelay={1500}>
        {fab}
      </Tooltip>
    );
  }

  return fab;
}

function ProductActiveStreamBanner({
  productName,
  onPress,
}: {
  productName: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={styles.streamBanner} accessibilityRole="button">
      <View style={styles.streamDot} />
      <Text variant="bodySmall" style={{ flex: 1, color: '#e53935' }}>
        Live: {productName}
      </Text>
      <Icon source="chevron-right" size={14} color="#e53935" />
    </Pressable>
  );
}

function ProductYouTubeSetupBanner({
  isGoogleLinked,
  onPress,
  surfaceVariant,
  onSurfaceVariant,
}: {
  isGoogleLinked: boolean;
  onPress: () => void;
  surfaceVariant: string;
  onSurfaceVariant: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.youtubeBanner, { backgroundColor: surfaceVariant }]}
      accessibilityRole="button"
      accessibilityLabel="Set up YouTube Live"
    >
      <Icon source="youtube" size={16} color={onSurfaceVariant} />
      <Text variant="bodySmall" style={{ flex: 1, color: onSurfaceVariant }}>
        {isGoogleLinked
          ? 'Enable YouTube Live in Integrations to stream this product'
          : 'Link your Google account to stream this product live'}
      </Text>
      <Icon source="chevron-right" size={16} color={onSurfaceVariant} />
    </Pressable>
  );
}

const baseFabStyle: ViewStyle = {
  position: (Platform.OS === 'web' ? 'fixed' : 'absolute') as 'absolute',
  bottom: 0,
  margin: 19,
};

const styles = {
  centerState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    gap: 16,
  } satisfies ViewStyle,
  centerText: {
    textAlign: 'center' as const,
  },
  subtleCenterText: {
    textAlign: 'center' as const,
    opacity: 0.7,
  },
  slowLoadingContainer: {
    position: 'absolute' as const,
    bottom: 100,
    left: 0,
    right: 0,
    alignItems: 'center' as const,
  },
  streamBanner: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
    marginHorizontal: 14,
    marginBottom: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: 'rgba(229,57,53,0.08)',
  },
  streamDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#e53935',
  },
  youtubeBanner: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
    marginHorizontal: 14,
    marginBottom: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    opacity: 0.7,
  },
  leftFab: {
    ...baseFabStyle,
    left: 0,
  } satisfies ViewStyle,
  rightFab: {
    ...baseFabStyle,
    right: 0,
  } satisfies ViewStyle,
};
