import { MaterialCommunityIcons } from '@expo/vector-icons';
import { HeaderBackButton } from '@react-navigation/elements';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { JSX, useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, NativeScrollEvent, NativeSyntheticEvent, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { AnimatedFAB, Button, Tooltip, useTheme } from 'react-native-paper';

import ProductAmountInParent from '@/components/product/ProductAmountInParent';
import ProductCircularityProperties from '@/components/product/ProductCircularityProperties';
import ProductComponents from '@/components/product/ProductComponents';
import ProductDelete from '@/components/product/ProductDelete';
import ProductDescription from '@/components/product/ProductDescription';
import ProductImage from '@/components/product/ProductImage';
import ProductMetaData from '@/components/product/ProductMetaData';
import ProductPhysicalProperties from '@/components/product/ProductPhysicalProperties';
import ProductTags from '@/components/product/ProductTags';
import ProductType from '@/components/product/ProductType';
import ProductCircularityProperties from '@/components/product/ProductCircularityProperties';
import ProductVideo from "@/components/product/ProductVideo";

import { useDialog } from '@/components/common/DialogProvider';

import { getProduct, newProduct } from '@/services/api/fetching';
import { deleteProduct, saveProduct } from '@/services/api/saving';
import { getProductNameHelperText, validateProduct, validateProductName } from '@/services/api/validation/product';
import { Product } from '@/types/Product';

/**
 * Type definition for search parameters used in the product page route.
 */
type searchParams = {
  id: string;
  name: string;
  model?: string;
  brand?: string;
  parent?: string;
  isComponent?: string;
};

export default function ProductPage(): JSX.Element {
  // Hooks
  const { id, name, model, brand, parent, isComponent } = useLocalSearchParams<searchParams>();
  const navigation = useNavigation();
  const router = useRouter();
  const dialog = useDialog();
  const theme = useTheme();

  // States
  const [product, setProduct] = useState<Product>({} as Product);
  const [editMode, setEditMode] = useState(id === 'new' || false);
  const [savingState, setSavingState] = useState<'saving' | 'success' | undefined>(undefined);
  const [fabExtended, setFabExtended] = useState(true);
  const [tooltipVisible, setTooltipVisible] = useState(false);

  const isProductComponent = typeof product.parentID === 'number' && !isNaN(product.parentID);

  // Validate product on every change
  const validationResult = useMemo(() => validateProduct(product), [product]);

  // Callbacks
  const onProductNameChange = useCallback(
    (newName: string) => {
      setProduct({ ...product, name: newName.trim() });
    },
    [product],
  );

  // Effects
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
              // Navigate to parent product if this is a component
              router.replace({
                pathname: '/products/[id]',
                params: { id: product.parentID.toString() },
              });
            } else {
              // Navigate to products list if this is a standalone product
              router.replace('/(tabs)/products');
            }
          }}
        />
      ),
      headerRight: editMode
        ? () => <EditNameButton product={product} onProductNameChange={onProductNameChange} />
        : undefined,
    });
  }, [navigation, product, editMode, isProductComponent, router, onProductNameChange]);

  useEffect(() => {
    if (id === 'new') {
      const newProd = newProduct(name, parent ? parseInt(parent) : NaN, brand, model);
      // Set default amountInParent to 1 for new components
      if (isComponent === 'true' && !newProd.amountInParent) {
        newProd.amountInParent = 1;
      }
      setProduct(newProd);
    } else if (id !== 'new') {
      getProduct(parseInt(id)).then(setProduct);
    }
  }, [id]);

  useEffect(() => {
    return navigation.addListener('beforeRemove', (e) => {
      if (!editMode) {
        return;
      }
      e.preventDefault();

      dialog.alert({
        title: 'Discard changes?',
        message: 'You have unsaved changes. Are you sure you want to discard them and leave the screen?',
        buttons: [
          { text: "Don't leave", onPress: () => {} },
          { text: 'Discard', onPress: () => navigation.dispatch(e.data.action) },
        ],
      });
    });
  }, [navigation, editMode, dialog]);

  // Callbacks
  const onChangeDescription = (newDescription: string) => {
    setProduct({ ...product, description: newDescription });
  };

  const onChangePhysicalProperties = (newProperties: typeof product.physicalProperties) => {
    setProduct({ ...product, physicalProperties: newProperties });
  };

  const onChangeCircularityProperties = (newProperties: typeof product.circularityProperties) => {
    setProduct({ ...product, circularityProperties: newProperties });
  };

  const onBrandChange = (newBrand: string) => {
    setProduct({ ...product, brand: newBrand });
  };

  const onModelChange = (newModel: string) => {
    setProduct({ ...product, model: newModel });
  };

  const onTypeChange = (newTypeId: number) => {
    setProduct({ ...product, productTypeID: newTypeId });
  };

  const onImagesChange = (newImages: { url: string; description: string; id: number }[]) => {
    setProduct({ ...product, images: newImages });
  };

  const onAmountInParentChange = (newAmount: number) => {
    setProduct({ ...product, amountInParent: newAmount });
  };

  const onVideoChange = (newVideos: { id?: number; url: string; description: string; title: string }[]) => {
    setProduct({ ...product, videos: newVideos });
  };

  const onProductDelete = () => {
    deleteProduct(product).then(() => {
      setEditMode(false);
      router.replace('/(tabs)/products');
    });
  };

  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    setFabExtended(event.nativeEvent.contentOffset.y <= 0);
  };

  // Methods

  /**
   * Switch between view and edit modes.
   */
  const toggleEditMode = () => {
    if (!editMode) {
      return setEditMode(true);
    }
    setSavingState('saving');
    saveProduct(product)
      .then((id) => {
        router.setParams({ id: id.toString() });
        setEditMode(false);
      })
      .finally(() => {
        setSavingState('success');
        setTimeout(() => setSavingState(undefined), 1000);
      });
  };

  const synchronizeProduct = () => {
    if (editMode) {
      return;
    }
    getProduct(parseInt(id)).then(setProduct);
  };

  const FABicon = () => {
    if (savingState === 'saving') {
      return <ActivityIndicator color={theme.colors.onBackground} />;
    }
    if (savingState === 'success') {
      return <MaterialCommunityIcons name="check-bold" size={20} color={theme.colors.onBackground} />;
    }
    if (editMode) {
      return <MaterialCommunityIcons name="content-save" size={20} color={theme.colors.onBackground} />;
    }
    return <MaterialCommunityIcons name="pencil" size={20} color={theme.colors.onBackground} />;
  };

  // Sub Render >> Product loading
  if (product.id === undefined) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  // Render
  return (
    <>
      <KeyboardAwareScrollView
        contentContainerStyle={{ gap: 15, paddingBottom: 5 }}
        onLayout={synchronizeProduct}
        onScroll={onScroll}
        scrollEventThrottle={16}
      >
        <ProductImage product={product} editMode={editMode} onImagesChange={onImagesChange} />
        <ProductDescription product={product} editMode={editMode} onChangeDescription={onChangeDescription} />
        <ProductTags
          product={product}
          editMode={editMode}
          onBrandChange={onBrandChange}
          onModelChange={onModelChange}
          isComponent={isProductComponent}
        />
        <ProductType product={product} editMode={editMode} onTypeChange={onTypeChange} />
        {isProductComponent && (
          <ProductAmountInParent product={product} editMode={editMode} onAmountChange={onAmountInParentChange} />
        )}
        <ProductPhysicalProperties
          product={product}
          editMode={editMode}
          onChangePhysicalProperties={onChangePhysicalProperties}
        />
        <ProductCircularityProperties
          product={product}
          editMode={editMode}
          onChangeCircularityProperties={onChangeCircularityProperties}
        />
        <ProductVideo product={product} editMode={editMode} onVideoChange={onVideoChange} />
        <ProductComponents product={product} editMode={editMode} />
        <ProductMetaData product={product} />
        <ProductDelete product={product} editMode={editMode} onDelete={onProductDelete} />
      </KeyboardAwareScrollView>
      <Tooltip title={validationResult.error || ''} enterTouchDelay={0} leaveTouchDelay={1500}>
        <AnimatedFAB
          icon={FABicon}
          onPress={toggleEditMode}
          onLongPress={() => setTooltipVisible(true)}
          style={{ position: 'absolute', right: 0, bottom: 0, overflow: 'hidden', margin: 19 }}
          disabled={!validationResult.isValid}
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
    if (!product) {
      return;
    }
    dialog.input({
      title: 'Edit name',
      placeholder: 'Product Name',
      helperText: getProductNameHelperText(),
      defaultValue: product.name || '',
      buttons: [
        { text: 'Cancel', onPress: () => undefined },
        {
          text: 'OK',
          disabled: (value) => {
            const result = validateProductName(value);
            return !result.isValid;
          },
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
