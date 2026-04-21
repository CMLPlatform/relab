import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import { useDialog } from '@/components/common/dialogContext';
import { useAuth } from '@/context/auth';
import { useStreamSession } from '@/context/streamSession';
import {
  getPrimaryFabIcon,
  getProductCapabilities,
  useProductPageHeader,
  useSavedIndicator,
  useSlowLoading,
  useStreamPrompt,
} from '@/hooks/products/productPageHelpers';
import { useAppFeedback } from '@/hooks/useAppFeedback';
import { useProductForm } from '@/hooks/useProductForm';
import { useProductQuery } from '@/hooks/useProductQueries';
import { useRpiIntegration } from '@/hooks/useRpiIntegration';
import { useYouTubeIntegration } from '@/hooks/useYouTubeIntegration';
import { useAppTheme } from '@/theme';

type SearchParams = {
  id: string;
};

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: product-page orchestration is intentionally exposed through one screen hook.
export function useProductPageScreen() {
  const { id } = useLocalSearchParams<SearchParams>();
  const navigation = useNavigation();
  const router = useRouter();
  const dialog = useDialog();
  const feedback = useAppFeedback();
  const theme = useAppTheme();
  const { user: profile } = useAuth();
  const { enabled: rpiEnabled } = useRpiIntegration();
  const { enabled: youtubeEnabled } = useYouTubeIntegration();
  const { activeStream } = useStreamSession();
  const isGoogleLinked =
    profile?.oauth_accounts?.some((account) => account.oauth_name === 'google') ?? false;

  const [fabExtended, setFabExtended] = useState(true);
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

  const slowLoading = useSlowLoading(isLoading);
  const showSavedIcon = useSavedIndicator(justSaved);
  useStreamPrompt({ activeStream, feedback, isNew, isProductComponent });

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

  useProductPageHeader({
    navigation,
    goBackWithGuards,
    product,
    parentProduct,
    isProductComponent,
    theme,
    editMode,
    onProductNameChange,
  });

  const capabilities = getProductCapabilities({
    product,
    activeStream,
    rpiEnabled,
    youtubeEnabled,
    isGoogleLinked,
    isNew,
    isProductComponent,
    justCreated,
  });

  useEffect(() => {
    return navigation.addListener('beforeRemove', (event) => {
      if (!(editMode || capabilities.streamingThisProduct)) return;
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
  }, [capabilities.streamingThisProduct, dialog, editMode, navigation]);

  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    setFabExtended(event.nativeEvent.contentOffset.y <= 0);
  };

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
      primaryFabIcon: () =>
        getPrimaryFabIcon({
          isSaving,
          showSavedIcon,
          editMode,
          theme,
        }),
      fabExtended,
      onScroll,
    },
    streaming: {
      activeStream,
      streamingThisProduct: capabilities.streamingThisProduct,
      streamingOtherProduct: capabilities.streamingOtherProduct,
      streamPickerVisible,
      openStreamPicker: () => setStreamPickerVisible(true),
      closeStreamPicker: () => setStreamPickerVisible(false),
    },
    capabilities,
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
      goToActiveStreamProduct: () => {
        if (!activeStream) return;
        router.push({
          pathname: '/products/[id]',
          params: { id: String(activeStream.productId) },
        });
      },
      goToProfileForYouTubeSetup: () => router.push('/profile'),
    },
  };
}
