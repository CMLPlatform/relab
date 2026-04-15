import { MaterialCommunityIcons } from '@expo/vector-icons';
import { HeaderBackButton, type HeaderBackButtonProps } from '@react-navigation/elements';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { type JSX, useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  View,
} from 'react-native';
import { Button, Text, useTheme } from 'react-native-paper';
import { useDialog } from '@/components/common/DialogProvider';
import { useAuth } from '@/context/AuthProvider';
import { useStreamSession } from '@/context/StreamSessionContext';
import { useAppFeedback } from '@/hooks/useAppFeedback';
import { useProductForm } from '@/hooks/useProductForm';
import { useProductQuery } from '@/hooks/useProductQueries';
import { useRpiIntegration } from '@/hooks/useRpiIntegration';
import { useYouTubeIntegration } from '@/hooks/useYouTubeIntegration';
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

export function useProductPageScreen() {
  const { id } = useLocalSearchParams<SearchParams>();
  const navigation = useNavigation();
  const router = useRouter();
  const dialog = useDialog();
  const feedback = useAppFeedback();
  const theme = useTheme();
  const { user: profile } = useAuth();
  const { enabled: rpiEnabled } = useRpiIntegration();
  const { enabled: youtubeEnabled } = useYouTubeIntegration();
  const { activeStream } = useStreamSession();
  const isGoogleLinked =
    profile?.oauth_accounts?.some((account) => account.oauth_name === 'google') ?? false;

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
  const ownedByMe = product.ownedBy === 'me';

  useEffect(() => {
    if (!isLoading) {
      setSlowLoading(false);
      return;
    }
    const timer = setTimeout(() => setSlowLoading(true), 5000);
    return () => clearTimeout(timer);
  }, [isLoading]);

  const goBackWithGuards = useCallback(() => {
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
      return;
    }

    navigate();
  }, [dialog, editMode, isProductComponent, product.parentID, router]);

  useEffect(() => {
    const truncatedProductName = truncateHeaderLabel(product?.name, 36);
    const truncatedParentName = truncateHeaderLabel(parentProduct?.name, 20);

    navigation.setOptions({
      title: isProductComponent ? undefined : truncatedProductName,
      headerLeft: (props: HeaderBackButtonProps) => (
        <HeaderBackButton {...props} onPress={goBackWithGuards} />
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
    editMode,
    goBackWithGuards,
    isProductComponent,
    navigation,
    onProductNameChange,
    parentProduct?.name,
    product,
    theme.colors.onSurfaceVariant,
  ]);

  const streamPromptedRef = useRef(false);
  useEffect(() => {
    if (!isNew || isProductComponent || !activeStream || streamPromptedRef.current) return;
    streamPromptedRef.current = true;
    feedback.alert({
      title: "You're live on YouTube",
      message: `Your stream for "${activeStream.productName}" is still running. It will keep going while you create this product.`,
      buttons: [{ text: 'Got it' }],
    });
  }, [activeStream, feedback, isNew, isProductComponent]);

  useEffect(() => {
    return navigation.addListener('beforeRemove', (event) => {
      if (!editMode && !streamingThisProduct) return;
      event.preventDefault();
      dialog.alert({
        title: editMode ? 'Discard changes?' : 'Stream still active',
        message: editMode
          ? 'You have unsaved changes. Are you sure you want to discard them and leave the screen?'
          : "You're currently live on YouTube. Leaving won't stop the stream — use Stop first.",
        buttons: editMode
          ? [
              { text: "Don't leave" },
              { text: 'Discard', onPress: () => navigation.dispatch(event.data.action) },
            ]
          : [
              { text: 'Stay' },
              { text: 'Leave anyway', onPress: () => navigation.dispatch(event.data.action) },
            ],
      });
    });
  }, [dialog, editMode, navigation, streamingThisProduct]);

  useEffect(() => {
    if (!justSaved) return;
    setShowSavedIcon(true);
    const timer = setTimeout(() => setShowSavedIcon(false), 3000);
    return () => clearTimeout(timer);
  }, [justSaved]);

  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    setFabExtended(event.nativeEvent.contentOffset.y <= 0);
  };

  const openStreamPicker = useCallback(() => {
    setStreamPickerVisible(true);
  }, []);

  const closeStreamPicker = useCallback(() => {
    setStreamPickerVisible(false);
  }, []);

  const goToActiveStreamProduct = useCallback(() => {
    if (!activeStream) return;
    router.push({
      pathname: '/products/[id]',
      params: { id: String(activeStream.productId) },
    });
  }, [activeStream, router]);

  const goToProfileForYouTubeSetup = useCallback(() => {
    router.push('/profile');
  }, [router]);

  const primaryFabIcon = useCallback((): JSX.Element => {
    if (isSaving) return <ActivityIndicator color={theme.colors.onBackground} />;
    if (showSavedIcon) {
      return (
        <MaterialCommunityIcons name="check-bold" size={20} color={theme.colors.onBackground} />
      );
    }
    if (editMode) {
      return (
        <MaterialCommunityIcons name="content-save" size={20} color={theme.colors.onBackground} />
      );
    }
    return <MaterialCommunityIcons name="pencil" size={20} color={theme.colors.onBackground} />;
  }, [editMode, isSaving, showSavedIcon, theme.colors.onBackground]);

  return {
    theme,
    screen: {
      product,
      parentProduct,
      isLoading,
      isError,
      error,
      slowLoading,
      refetch,
    },
    editing: {
      editMode,
      isSaving,
      validationResult,
      primaryFabIcon,
      fabExtended,
      onScroll,
    },
    streaming: {
      activeStream,
      streamingThisProduct,
      streamingOtherProduct,
      streamPickerVisible,
      openStreamPicker,
      closeStreamPicker,
    },
    capabilities: {
      isNew,
      isProductComponent,
      justCreated,
      rpiEnabled,
      youtubeEnabled,
      isGoogleLinked,
      ownedByMe,
    },
    actions: {
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
      toggleEditMode,
      goBackWithGuards,
      goToActiveStreamProduct,
      goToProfileForYouTubeSetup,
    },
  };
}

function EditNameButton({
  product,
  onProductNameChange,
}: {
  product: Product | undefined;
  onProductNameChange?: (newName: string) => void;
}) {
  const dialog = useDialog();
  const feedback = useAppFeedback();

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
              feedback.error(
                parseResult.error.issues[0]?.message || 'Invalid product name',
                'Invalid product name',
              );
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
