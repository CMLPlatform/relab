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
  getSaveStatus,
  useProductPageHeader,
  useSavedIndicator,
} from './productPageHelpers';
import { useSlowLoading } from './state';
import { useAncestorTrail } from './useAncestorTrail';
import { useProductEditShortcuts } from './useProductEditShortcuts';
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

  // Right after the mutation resolves the form is still `isDirty`, so save
  // and delete must bypass the unsaved-changes guard.
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
    serverProduct,
    editMode,
    isDirty,
    isProductComponent,
    validationResult,
    isLoading,
    isError,
    error,
    refetch,
    isSaving,
    isPaused,
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
    amountFlushRef,
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

  // Read the back target from the fetched record, not the watched form: the
  // form holds the blank `newProduct()` sentinel (role 'product', no parentID)
  // until hydration resets it, one commit after `isLoading` has already gone
  // false, so a header closure captured in that frame sent a component to the
  // products list instead of to its parent. Park the press until the record is
  // in hand; a failed or absent fetch falls through rather than deadlocking the
  // control.
  const hasRecordId = Number.isFinite(Number.parseInt(id ?? '', 10));
  const recordSettled = !hasRecordId || serverProduct !== undefined || isError;
  // `product` is a fresh useWatch reference every render; pin the three fields
  // the target depends on so the header effect does not re-run each render.
  const backSource = serverProduct ?? product;
  const backTarget = useMemo(
    () => ({
      role: backSource.role,
      parentID: backSource.parentID,
      parentRole: backSource.parentRole,
    }),
    [backSource.role, backSource.parentID, backSource.parentRole],
  );
  const pendingBackRef = useRef(false);
  const navigateBack = useCallback(() => {
    if (!recordSettled) {
      pendingBackRef.current = true;
      return;
    }
    if (backTarget.role === 'component' && backTarget.parentID) {
      const parentRole = backTarget.parentRole ?? directParent?.role;
      const parentIsComponent = parentRole === 'component';
      router.replace({
        pathname: parentIsComponent ? '/components/[id]' : '/products/[id]',
        params: { id: backTarget.parentID.toString() },
      });
    } else {
      router.replace('/products');
    }
  }, [backTarget, directParent?.role, recordSettled, router]);
  useEffect(() => {
    navigateBackRef.current = navigateBack;
  }, [navigateBack]);
  useEffect(() => {
    if (!recordSettled || !pendingBackRef.current) return;
    pendingBackRef.current = false;
    navigateBack();
  }, [recordSettled, navigateBack]);

  const goBackWithGuards = useCallback(() => {
    if (hasUnsavedChanges || capabilities.streamingThisProduct) {
      confirmLeave(navigateBack);
      return;
    }
    navigateBack();
  }, [capabilities.streamingThisProduct, confirmLeave, hasUnsavedChanges, navigateBack]);

  const headerTitle = useProductPageHeader({
    navigation,
    goBackWithGuards,
    product,
    ancestors,
    isProductComponent,
    theme,
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

  // Edit mode is the ?edit=1 query param, so entering it keeps the screen
  // mounted. The FAB and the "e" shortcut share this one handler.
  const enterEditMode = useCallback(() => router.setParams({ edit: '1' }), [router]);

  // Web-only e / Escape / Cmd+S, routed through the same handlers as the Edit
  // FAB, the header back button, and the save bar.
  useProductEditShortcuts({
    editMode,
    canEdit: capabilities.ownedByMe,
    canSave: validationResult.isValid && !isSaving,
    onEdit: enterEditMode,
    onSave: saveAndExit,
    onExit: goBackWithGuards,
  });

  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    setFabExtended(event.nativeEvent.contentOffset.y <= 0);
  };

  return {
    theme,
    screen: {
      product,
      ancestors,
      headerTitle,
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
      isPaused,
      validationResult,
      // True for the 3s "Saved" window after a successful save.
      justSaved: showSavedIcon,
      saveStatus: getSaveStatus({
        editMode,
        id: typeof product.id === 'number' ? product.id : undefined,
        isSaving,
        isPaused,
        isDirty,
      }),
      primaryFabIcon: () =>
        getPrimaryFabIcon({
          isSaving,
          isPaused,
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
      onProductNameChange,
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
      enterEditMode,
    },
    amountFlushRef,
  };
}
