import { MaterialCommunityIcons } from '@expo/vector-icons';
import { HeaderBackButton } from '@react-navigation/elements';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { JSX, useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, NativeScrollEvent, NativeSyntheticEvent, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { AnimatedFAB, Button, Card, Text, Tooltip, useTheme } from 'react-native-paper';

import DetailCard from '@/components/common/DetailCard';
import ProductAmountInParent from '@/components/product/ProductAmountInParent';
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

import { useDialog } from '@/components/common/DialogProvider';
import ProductDetailsSkeleton from '@/components/common/ProductDetailsSkeleton';
import { useProductForm } from '@/hooks/useProductForm';
import { getProductNameHelperText, validateProductName } from '@/services/api/validation/product';
import { Product } from '@/types/Product';

type SearchParams = {
  id: string;
};

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
    navigation.setOptions({
      title: product?.name || 'Product',
      headerLeft: (props: any) => (
        <HeaderBackButton
          {...props}
          onPress={() => {
            if (navigation.canGoBack()) {
              navigation.goBack();
            } else if (isProductComponent && product.parentID) {
              router.replace({ pathname: '/products/[id]', params: { id: product.parentID.toString() } });
            } else {
              router.replace('/products');
            }
          }}
        />
      ),
      headerRight: editMode
        ? () => <EditNameButton product={product} onProductNameChange={onProductNameChange} />
        : undefined,
    });
  }, [navigation, product, editMode, isProductComponent, router, onProductNameChange]);

  // ─── Unsaved changes guard ───────────────────────────────────────────────────
  useEffect(() => {
    return navigation.addListener('beforeRemove', (e) => {
      if (!editMode) return;
      e.preventDefault();
      dialog.alert({
        title: 'Discard changes?',
        message: 'You have unsaved changes. Are you sure you want to discard them and leave the screen?',
        buttons: [{ text: "Don't leave" }, { text: 'Discard', onPress: () => navigation.dispatch(e.data.action) }],
      });
    });
  }, [navigation, editMode, dialog]);

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    setFabExtended(e.nativeEvent.contentOffset.y <= 0);
  };

  // ─── FAB icon ────────────────────────────────────────────────────────────────
  const FABicon = useCallback(() => {
    if (isSaving) return <ActivityIndicator color={theme.colors.onBackground} />;
    if (showSavedIcon) return <MaterialCommunityIcons name="check-bold" size={20} color={theme.colors.onBackground} />;
    if (editMode) return <MaterialCommunityIcons name="content-save" size={20} color={theme.colors.onBackground} />;
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
          <View style={{ position: 'absolute', bottom: 100, left: 0, right: 0, alignItems: 'center' }}>
            <Card style={{ backgroundColor: theme.colors.surfaceVariant, paddingHorizontal: 16, paddingVertical: 8 }}>
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
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20, gap: 16 }}>
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
        <ProductImageGallery product={product} editMode={editMode} onImagesChange={onImagesChange} />
        <DetailCard>
          <ProductDescription product={product} editMode={editMode} onChangeDescription={onChangeDescription} />
        </DetailCard>
        <ProductTags
          product={product}
          editMode={editMode}
          onBrandChange={onBrandChange}
          onModelChange={onModelChange}
          isComponent={isProductComponent}
        />
        <DetailCard>
          <ProductType product={product} editMode={editMode} onTypeChange={onTypeChange} />
        </DetailCard>
        {isProductComponent && (
          <ProductAmountInParent product={product} editMode={editMode} onAmountChange={onAmountInParentChange} />
        )}
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
              <Card style={{ marginHorizontal: 14, backgroundColor: theme.colors.secondaryContainer }} mode="contained">
                <Card.Content>
                  <Text variant="bodyMedium" style={{ color: theme.colors.onSecondaryContainer }}>
                    Product saved! Want to track sub-components (e.g. battery, screen)? Use the &quot;Add
                    component&quot; button below.
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
          style={{ position: 'absolute', right: 0, bottom: 0, overflow: 'hidden', margin: 19 }}
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
          disabled: (value) => !validateProductName(value).isValid,
          onPress: (newName) => {
            const name = typeof newName === 'string' ? newName.trim() : '';
            const result = validateProductName(name);
            if (!result.isValid) {
              alert(result.error);
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
