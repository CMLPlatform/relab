import { MaterialCommunityIcons } from '@expo/vector-icons';
import { HeaderBackButton, type HeaderBackButtonProps } from '@react-navigation/elements';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { type JSX, useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Platform,
  View,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { AnimatedFAB, Button, Card, Text, Tooltip, useTheme } from 'react-native-paper';

import DetailCard from '@/components/common/DetailCard';
import { useDialog } from '@/components/common/DialogProvider';
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
import { useProductForm } from '@/hooks/useProductForm';
import { useProductQuery } from '@/hooks/useProductQueries';
import { getProductNameHelperText, productSchema } from '@/services/api/validation/productSchema';

import type { Product } from '@/types/Product';

type SearchParams = {
  id: string;
};

function truncateHeaderLabel(value: string | undefined, maxLength: number): string {
  if (!value) return 'Product';
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

export default function ProductPage(): JSX.Element {
  const { id } = useLocalSearchParams<SearchParams>();
  const navigation = useNavigation();
  const router = useRouter();
  const dialog = useDialog();
  const theme = useTheme();

  const [fabExtended, setFabExtended] = useState(true);
  const [slowLoading, setSlowLoading] = useState(false);
  const [showSavedIcon, setShowSavedIcon] = useState(false);

  const {
    product,
    editMode,
    isNew,
    isProductComponent,
    justCreated,
    validationResult,
    isLoading,
    isError,
    error,
    refetch,
    isSaving,
    justSaved,
    onProductNameChange,
    onChangeDescription,
    onChangePhysicalProperties,
    onChangeCircularityProperties,
    onBrandChange,
    onModelChange,
    onTypeChange,
    onImagesChange,
    onAmountInParentChange,
    onVideoChange,
    toggleEditMode,
    onProductDelete,
  } = useProductForm(id);
  const parentProductId =
    typeof product.parentID === 'number' && !Number.isNaN(product.parentID)
      ? product.parentID
      : undefined;
  const { data: parentProduct } = useProductQuery(parentProductId ?? 'new');

  // ─── Timeout for slow loading ────────────────────────────────────────────────
  useEffect(() => {
    if (!isLoading) {
      setSlowLoading(false);
      return;
    }
    const timer = setTimeout(() => setSlowLoading(true), 5000);
    return () => clearTimeout(timer);
  }, [isLoading]);

  // ─── Navigation header ───────────────────────────────────────────────────────
  useEffect(() => {
    const truncatedProductName = truncateHeaderLabel(product?.name, 36);
    const truncatedParentName = truncateHeaderLabel(parentProduct?.name, 20);

    navigation.setOptions({
      title: isProductComponent ? undefined : truncatedProductName,
      headerLeft: (props: HeaderBackButtonProps) => (
        <HeaderBackButton
          {...props}
          onPress={() => {
            if (navigation.canGoBack()) {
              navigation.goBack();
            } else if (isProductComponent && product.parentID) {
              router.replace({
                pathname: '/products/[id]',
                params: { id: product.parentID.toString() },
              });
            } else {
              router.replace('/products');
            }
          }}
        />
      ),
      headerTitle:
        isProductComponent && parentProduct?.name && typeof product.parentID === 'number'
          ? () => (
              <View style={{ maxWidth: 260, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text
                  numberOfLines={1}
                  style={{ maxWidth: 100, fontSize: 13, opacity: 0.7, fontWeight: '600' }}
                >
                  {truncatedParentName}
                </Text>
                <MaterialCommunityIcons
                  name="chevron-right"
                  size={16}
                  color={theme.colors.onSurfaceVariant}
                />
                <Text numberOfLines={1} style={{ flexShrink: 1, fontSize: 16, fontWeight: '700' }}>
                  {truncatedProductName}
                </Text>
              </View>
            )
          : undefined,
      headerRight: editMode
        ? () => <EditNameButton product={product} onProductNameChange={onProductNameChange} />
        : undefined,
    });
  }, [
    navigation,
    product,
    editMode,
    isProductComponent,
    parentProduct?.name,
    router,
    onProductNameChange,
    theme.colors.onSurfaceVariant,
  ]);

  // ─── Unsaved changes guard ───────────────────────────────────────────────────
  useEffect(() => {
    return navigation.addListener('beforeRemove', (e) => {
      if (!editMode) return;
      e.preventDefault();
      dialog.alert({
        title: 'Discard changes?',
        message:
          'You have unsaved changes. Are you sure you want to discard them and leave the screen?',
        buttons: [
          { text: "Don't leave" },
          { text: 'Discard', onPress: () => navigation.dispatch(e.data.action) },
        ],
      });
    });
  }, [navigation, editMode, dialog]);

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    setFabExtended(e.nativeEvent.contentOffset.y <= 0);
  };

  // ─── FAB icon ────────────────────────────────────────────────────────────────
  const FABicon = useCallback(() => {
    if (isSaving) return <ActivityIndicator color={theme.colors.onBackground} />;
    if (showSavedIcon)
      return (
        <MaterialCommunityIcons name="check-bold" size={20} color={theme.colors.onBackground} />
      );
    if (editMode)
      return (
        <MaterialCommunityIcons name="content-save" size={20} color={theme.colors.onBackground} />
      );
    return <MaterialCommunityIcons name="pencil" size={20} color={theme.colors.onBackground} />;
  }, [isSaving, showSavedIcon, editMode, theme.colors.onBackground]);

  // Show the saved checkmark briefly after a successful save
  useEffect(() => {
    if (!justSaved) return;
    setShowSavedIcon(true);
    const t = setTimeout(() => setShowSavedIcon(false), 3000);
    return () => clearTimeout(t);
  }, [justSaved]);

  // ─── Loading state ────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <View style={{ flex: 1 }}>
        <ProductDetailsSkeleton />
        {slowLoading && (
          <View
            style={{ position: 'absolute', bottom: 100, left: 0, right: 0, alignItems: 'center' }}
          >
            <Card
              style={{
                backgroundColor: theme.colors.surfaceVariant,
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

  // ─── Error state ──────────────────────────────────────────────────────────────
  if (isError) {
    return (
      <View
        style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20, gap: 16 }}
      >
        <MaterialCommunityIcons name="alert-circle-outline" size={64} color={theme.colors.error} />
        <Text variant="headlineSmall" style={{ textAlign: 'center' }}>
          Oops! Something went wrong
        </Text>
        <Text variant="bodyMedium" style={{ textAlign: 'center', opacity: 0.7 }}>
          {String(error) || 'We encountered an error while loading the product details.'}
        </Text>
        <Button mode="contained" onPress={() => refetch()} style={{ marginTop: 8 }}>
          Try Again
        </Button>
      </View>
    );
  }

  // Fallback for missing product
  if (!product.id && !isNew) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  // ─── Render ────────────────────────────────────────────────────────────────────
  return (
    <>
      <KeyboardAwareScrollView
        contentContainerStyle={{ gap: 15, paddingBottom: 5 }}
        onScroll={onScroll}
        scrollEventThrottle={16}
      >
        <ProductImageGallery
          product={product}
          editMode={editMode}
          onImagesChange={onImagesChange}
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
        <DetailCard>
          <ProductVideo product={product} editMode={editMode} onVideoChange={onVideoChange} />
        </DetailCard>
        {isNew ? null : (
          <>
            {justCreated && (
              <Card
                style={{ marginHorizontal: 14, backgroundColor: theme.colors.secondaryContainer }}
                mode="contained"
              >
                <Card.Content>
                  <Text variant="bodyMedium" style={{ color: theme.colors.onSecondaryContainer }}>
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
      </KeyboardAwareScrollView>
      <Tooltip title={validationResult.error || ''} enterTouchDelay={0} leaveTouchDelay={1500}>
        <AnimatedFAB
          icon={FABicon}
          onPress={toggleEditMode}
          style={{
            position: (Platform.OS === 'web' ? 'fixed' : 'absolute') as 'absolute',
            right: 0,
            bottom: 0,
            overflow: 'hidden',
            margin: 19,
          }}
          disabled={!validationResult.isValid || isSaving}
          extended={fabExtended}
          label={editMode ? 'Save Product' : 'Edit Product'}
          visible={product.ownedBy === 'me'}
        />
      </Tooltip>
    </>
  );
}

function EditNameButton({
  product,
  onProductNameChange,
}: {
  product: Product | undefined;
  onProductNameChange?: (newName: string) => void;
}) {
  const dialog = useDialog();

  const onPress = () => {
    if (!product) return;
    dialog.input({
      title: 'Edit name',
      placeholder: 'Product Name',
      helperText: getProductNameHelperText(),
      defaultValue: product.name || '',
      buttons: [
        { text: 'Cancel' },
        {
          text: 'OK',
          disabled: (value) => {
            const parseResult = productSchema.shape.name.safeParse(value);
            return !parseResult.success;
          },
          onPress: (newName) => {
            const name = typeof newName === 'string' ? newName.trim() : '';
            const parseResult = productSchema.shape.name.safeParse(name);
            if (!parseResult.success) {
              alert(parseResult.error.issues[0]?.message || 'Invalid product name');
              return;
            }
            onProductNameChange?.(name);
          },
        },
      ],
    });
  };

  return <Button onPress={onPress}>Edit name</Button>;
}
