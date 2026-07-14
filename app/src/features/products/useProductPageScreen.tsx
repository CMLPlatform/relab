import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import { useDialog } from '@/components/base/dialogContext';
import { useAuth } from '@/context/auth';
import { useStreamSession } from '@/context/streamSession';
import { useRpiIntegration } from '@/features/cameras/rpi/useRpiIntegration';
import { useYouTubeIntegration } from '@/features/cameras/youtube/useYouTubeIntegration';
import { useAppTheme } from '@/theme';
import {
  getPrimaryFabIcon,
  getProductCapabilities,
  useProductPageHeader,
  useSavedIndicator,
} from './productPageHelpers';
import { useSlowLoading } from './state';
import { useAncestorTrail } from './useAncestorTrail';
import { type UseProductFormOptions, useProductForm } from './useProductForm';

type SearchParams = {
  id: string;
};

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: product-page orchestration is intentionally exposed through one screen hook.
export function useProductPageScreen(formOptions: UseProductFormOptions) {
  const { id } = useLocalSearchParams<SearchParams>();
  const navigation = useNavigation();
  const router = useRouter();
  const dialog = useDialog();
  const theme = useAppTheme();
  const { user: profile } = useAuth();
  const { enabled: rpiEnabled } = useRpiIntegration();
  const { enabled: youtubeEnabled } = useYouTubeIntegration();
  const { activeStream } = useStreamSession();
  const isGoogleLinked =
    profile?.oauth_accounts?.some((account) => account.oauth_name === 'google') ?? false;

  const [fabExtended, setFabExtended] = useState(true);
  const [streamPickerVisible, setStreamPickerVisible] = useState(false);
  const skipNextBeforeRemoveRef = useRef(false);
  // navigateBack is defined further down, after wrappedFormOptions needs it;
  // route the delete callback through a ref so the memo doesn't depend on it.
  const navigateBackRef = useRef<() => void>(() => {});

  // Wrap the caller's onSaveSuccess so a successful save bypasses the unsaved-
  // changes guard: immediately after mutation resolves the form is still
  // `isDirty`, so the guard would otherwise block the navigation the caller
  // just requested. Delete gets the same guard-skip and lands via
  // navigateBack (parent, not root list).
  const wrappedFormOptions = useMemo<UseProductFormOptions>(() => {
    const callerOnSaveSuccess = formOptions.onSaveSuccess;
    return {
      ...formOptions,
      onSaveSuccess: (savedId: number) => {
        skipNextBeforeRemoveRef.current = true;
        callerOnSaveSuccess?.(savedId);
      },
      onDeleteSuccess: () => {
        skipNextBeforeRemoveRef.current = true;
        navigateBackRef.current();
      },
    };
  }, [formOptions]);

  const {
    product,
    editMode,
    isDirty,
    isProductComponent,
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
    saveAndExit,
    onProductDelete,
  } = useProductForm(id, wrappedFormOptions);

  const parentProductId = product.role === 'component' ? product.parentID : undefined;
  const { ancestors } = useAncestorTrail(parentProductId);
  const directParent = ancestors.length > 0 ? ancestors[ancestors.length - 1] : undefined;

  const slowLoading = useSlowLoading(isLoading);
  const showSavedIcon = useSavedIndicator(justSaved);

  const hasUnsavedChanges = isDirty;

  const confirmLeave = useCallback(
    (onConfirm: () => void) => {
      dialog.alert({
        title: hasUnsavedChanges ? 'Discard changes?' : 'Stream still active',
        message: hasUnsavedChanges
          ? 'You have unsaved changes. Are you sure you want to discard them and leave the screen?'
          : "You're currently live on YouTube. Leaving won't stop the stream — use Stop first.",
        buttons: hasUnsavedChanges
          ? [
              { text: "Don't leave" },
              {
                text: 'Discard',
                onPress: () => {
                  skipNextBeforeRemoveRef.current = true;
                  onConfirm();
                },
              },
            ]
          : [
              { text: 'Stay' },
              {
                text: 'Leave anyway',
                onPress: () => {
                  skipNextBeforeRemoveRef.current = true;
                  onConfirm();
                },
              },
            ],
      });
    },
    [dialog, hasUnsavedChanges],
  );

  const capabilities = useMemo(
    () =>
      getProductCapabilities({
        product,
        activeStream,
        rpiEnabled,
        youtubeEnabled,
        isGoogleLinked,
        isProductComponent,
      }),
    [product, activeStream, rpiEnabled, youtubeEnabled, isGoogleLinked, isProductComponent],
  );

  const navigateBack = useCallback(() => {
    if (isProductComponent && product.parentID) {
      const parentRole = product.parentRole ?? directParent?.role;
      const parentIsComponent = parentRole === 'component';
      router.replace({
        pathname: parentIsComponent ? '/components/[id]' : '/products/[id]',
        params: { id: product.parentID.toString() },
      });
    } else {
      router.replace('/products');
    }
  }, [directParent?.role, isProductComponent, product.parentID, product.parentRole, router]);
  useEffect(() => {
    navigateBackRef.current = navigateBack;
  }, [navigateBack]);

  const goBackWithGuards = useCallback(() => {
    if (hasUnsavedChanges || capabilities.streamingThisProduct) {
      confirmLeave(navigateBack);
      return;
    }
    navigateBack();
  }, [capabilities.streamingThisProduct, confirmLeave, hasUnsavedChanges, navigateBack]);

  useProductPageHeader({
    navigation,
    goBackWithGuards,
    product,
    ancestors,
    isProductComponent,
    theme,
    editMode,
    onProductNameChange,
  });

  useEffect(() => {
    return navigation.addListener('beforeRemove', (event) => {
      if (skipNextBeforeRemoveRef.current) {
        skipNextBeforeRemoveRef.current = false;
        return;
      }
      if (!(hasUnsavedChanges || capabilities.streamingThisProduct)) return;
      event.preventDefault();
      confirmLeave(() => navigation.dispatch(event.data.action));
    });
  }, [capabilities.streamingThisProduct, confirmLeave, hasUnsavedChanges, navigation]);

  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    setFabExtended(event.nativeEvent.contentOffset.y <= 0);
  };

  return {
    theme,
    screen: {
      product,
      ancestors,
      isLoading,
      isError,
      error,
      slowLoading,
      refetch,
    },
    editing: {
      editMode,
      isDirty,
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
      saveAndExit,
      goBackWithGuards,
    },
  };
}
