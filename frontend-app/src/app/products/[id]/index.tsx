import { MaterialCommunityIcons } from '@expo/vector-icons';
import { HeaderBackButton, type HeaderBackButtonProps } from '@react-navigation/elements';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { type JSX, useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Platform,
  Pressable,
  View,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { AnimatedFAB, Button, Card, Icon, Text, Tooltip, useTheme } from 'react-native-paper';

import { CameraStreamPicker } from '@/components/cameras/CameraStreamPicker';
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
import { useAuth } from '@/context/AuthProvider';
import { useStreamSession } from '@/context/StreamSessionContext';
import { useProductForm } from '@/hooks/useProductForm';
import { useProductQuery } from '@/hooks/useProductQueries';
import { useRpiIntegration } from '@/hooks/useRpiIntegration';
import { useYouTubeIntegration } from '@/hooks/useYouTubeIntegration';
import { isProductNotFoundError } from '@/services/api/products';
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
  const { user: profile } = useAuth();
  const { enabled: rpiEnabled } = useRpiIntegration();
  const { enabled: youtubeEnabled } = useYouTubeIntegration();
  const isGoogleLinked = profile?.oauth_accounts?.some((a) => a.oauth_name === 'google') ?? false;
  const { activeStream } = useStreamSession();

  const [fabExtended, setFabExtended] = useState(true);
  const [slowLoading, setSlowLoading] = useState(false);
  const [showSavedIcon, setShowSavedIcon] = useState(false);
  const [streamPickerVisible, setStreamPickerVisible] = useState(false);

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

  const streamingThisProduct =
    typeof product.id === 'number' && activeStream?.productId === product.id;
  const streamingOtherProduct = !!activeStream && !streamingThisProduct;

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
            const navigate = () => {
              if (isProductComponent && product.parentID) {
                router.replace({
                  pathname: '/products/[id]',
                  params: { id: product.parentID.toString() },
                });
              } else {
                router.replace('/products');
              }
            };
            if (editMode) {
              dialog.alert({
                title: 'Discard changes?',
                message:
                  'You have unsaved changes. Are you sure you want to discard them and leave the screen?',
                buttons: [{ text: "Don't leave" }, { text: 'Discard', onPress: navigate }],
              });
            } else {
              navigate();
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
    dialog,
  ]);

  // ─── Active stream prompt for new base products ───────────────────────────────
  const streamPromptedRef = useRef(false);
  useEffect(() => {
    if (!isNew || isProductComponent || !activeStream || streamPromptedRef.current) return;
    streamPromptedRef.current = true;
    Alert.alert(
      `You're live on YouTube`,
      `Your stream for "${activeStream.productName}" is still running. It will keep going while you create this product.`,
      [{ text: 'Got it' }],
    );
  }, [isNew, isProductComponent, activeStream]);

  // ─── Unsaved changes guard ───────────────────────────────────────────────────
  useEffect(() => {
    return navigation.addListener('beforeRemove', (e) => {
      if (!editMode && !streamingThisProduct) return;
      e.preventDefault();
      dialog.alert({
        title: editMode ? 'Discard changes?' : 'Stream still active',
        message: editMode
          ? 'You have unsaved changes. Are you sure you want to discard them and leave the screen?'
          : "You're currently live on YouTube. Leaving won't stop the stream — use Stop first.",
        buttons: editMode
          ? [
              { text: "Don't leave" },
              { text: 'Discard', onPress: () => navigation.dispatch(e.data.action) },
            ]
          : [
              { text: 'Stay' },
              { text: 'Leave anyway', onPress: () => navigation.dispatch(e.data.action) },
            ],
      });
    });
  }, [navigation, editMode, streamingThisProduct, dialog]);

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
    if (isProductNotFoundError(error)) {
      return (
        <View
          style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20, gap: 16 }}
        >
          <MaterialCommunityIcons
            name="package-variant-closed-remove"
            size={64}
            color={theme.colors.onSurfaceVariant}
          />
          <Text variant="headlineSmall" style={{ textAlign: 'center' }}>
            Product not found
          </Text>
          <Text variant="bodyMedium" style={{ textAlign: 'center', opacity: 0.7 }}>
            This product may have been removed or the link is no longer valid.
          </Text>
          <Button
            mode="contained"
            onPress={() => router.replace('/products')}
            style={{ marginTop: 8 }}
          >
            Back to products
          </Button>
        </View>
      );
    }

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
        {rpiEnabled &&
          !isNew &&
          !editMode &&
          !isProductComponent &&
          product.ownedBy === 'me' &&
          streamingOtherProduct &&
          activeStream && (
            <Pressable
              onPress={() =>
                router.push({
                  pathname: '/products/[id]',
                  params: { id: String(activeStream.productId) },
                })
              }
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                marginHorizontal: 14,
                marginBottom: 8,
                paddingVertical: 10,
                paddingHorizontal: 12,
                borderRadius: 8,
                backgroundColor: 'rgba(229,57,53,0.08)',
              }}
              accessibilityRole="button"
            >
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#e53935' }} />
              <Text variant="bodySmall" style={{ flex: 1, color: '#e53935' }}>
                Live: {activeStream.productName}
              </Text>
              <Icon source="chevron-right" size={14} color="#e53935" />
            </Pressable>
          )}
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
        {rpiEnabled &&
          !isNew &&
          !editMode &&
          !isProductComponent &&
          product.ownedBy === 'me' &&
          !youtubeEnabled && (
            <Pressable
              onPress={() => router.push('/profile')}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                marginHorizontal: 14,
                marginBottom: 8,
                paddingVertical: 10,
                paddingHorizontal: 12,
                borderRadius: 8,
                backgroundColor: theme.colors.surfaceVariant,
                opacity: 0.7,
              }}
              accessibilityRole="button"
              accessibilityLabel="Set up YouTube Live"
            >
              <Icon source="youtube" size={16} color={theme.colors.onSurfaceVariant} />
              <Text variant="bodySmall" style={{ flex: 1, color: theme.colors.onSurfaceVariant }}>
                {isGoogleLinked
                  ? 'Enable YouTube Live in Integrations to stream this product'
                  : 'Link your Google account to stream this product live'}
              </Text>
              <Icon source="chevron-right" size={16} color={theme.colors.onSurfaceVariant} />
            </Pressable>
          )}
      </KeyboardAwareScrollView>
      {rpiEnabled &&
        youtubeEnabled &&
        isGoogleLinked &&
        !isNew &&
        !editMode &&
        !isProductComponent &&
        product.ownedBy === 'me' &&
        typeof product.id === 'number' &&
        !streamingOtherProduct &&
        !streamingThisProduct && (
          <AnimatedFAB
            icon="youtube"
            label="Go Live"
            extended={fabExtended}
            onPress={() => setStreamPickerVisible(true)}
            style={{
              position: (Platform.OS === 'web' ? 'fixed' : 'absolute') as 'absolute',
              left: 0,
              bottom: 0,
              margin: 19,
            }}
          />
        )}
      {editMode && validationResult.error ? (
        <Tooltip title={validationResult.error} enterTouchDelay={0} leaveTouchDelay={1500}>
          <AnimatedFAB
            icon={FABicon}
            onPress={toggleEditMode}
            style={{
              position: (Platform.OS === 'web' ? 'fixed' : 'absolute') as 'absolute',
              right: 0,
              bottom: 0,
              margin: 19,
            }}
            disabled={!validationResult.isValid || isSaving}
            extended={fabExtended}
            label="Save Product"
            visible={product.ownedBy === 'me'}
          />
        </Tooltip>
      ) : (
        <AnimatedFAB
          icon={FABicon}
          onPress={toggleEditMode}
          style={{
            position: (Platform.OS === 'web' ? 'fixed' : 'absolute') as 'absolute',
            right: 0,
            bottom: 0,
            margin: 19,
          }}
          disabled={(editMode && !validationResult.isValid) || isSaving}
          extended={fabExtended}
          label={editMode ? 'Save Product' : 'Edit Product'}
          visible={product.ownedBy === 'me'}
        />
      )}
      {typeof product.id === 'number' && (
        <CameraStreamPicker
          productId={product.id}
          productName={product.name ?? ''}
          visible={streamPickerVisible}
          onDismiss={() => setStreamPickerVisible(false)}
        />
      )}
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
