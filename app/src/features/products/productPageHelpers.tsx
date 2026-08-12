import type { NativeStackHeaderBackProps } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { HeaderBackButton } from '@/components/base/HeaderBackButton';
import { Icon } from '@/components/base/Icon';
import { AncestorTrailHeader } from '@/components/product/AncestorTrailHeader';
import { ProductNameHeader } from '@/components/product/ProductNameHeader';
import type { AppTheme } from '@/theme';
import type { Product } from '@/types/Product';
import { truncateHeaderLabel } from './truncateHeaderLabel';
import type { AncestorCrumb } from './useAncestorTrail';

export function useSavedIndicator(justSaved: boolean) {
  const [showSavedIcon, setShowSavedIcon] = useState(false);

  useEffect(() => {
    if (!justSaved) return;

    const showTimer = setTimeout(() => setShowSavedIcon(true), 0);
    const hideTimer = setTimeout(() => setShowSavedIcon(false), 3000);
    return () => {
      clearTimeout(showTimer);
      clearTimeout(hideTimer);
    };
  }, [justSaved]);

  return showSavedIcon;
}

export function useProductPageHeader({
  navigation,
  goBackWithGuards,
  product,
  ancestors,
  isProductComponent,
  theme,
  editMode,
  onProductNameChange,
}: {
  navigation: {
    setOptions: (options: {
      title?: string;
      headerLeft?: (props: NativeStackHeaderBackProps) => React.ReactNode;
      headerTitle?: (() => React.ReactNode) | undefined;
      headerRight?: (() => React.ReactNode) | undefined;
    }) => void;
  };
  goBackWithGuards: () => void;
  product: Product;
  ancestors: AncestorCrumb[];
  isProductComponent: boolean;
  theme: AppTheme;
  editMode: boolean;
  onProductNameChange?: (newName: string) => void;
}) {
  useEffect(() => {
    const name = product.name;
    const showTrail = isProductComponent && ancestors.length > 0;
    // In edit mode the header *is* the name field, so always render a custom
    // title (input). In view mode, a plain-string title is enough for base
    // products; components fall through to the ancestor trail.
    const needsCustomTitle = editMode || showTrail;

    const titleSlot = (
      // Key on product identity: the detail screen stays mounted across
      // product navigation, so remounting the header per product drops any
      // stale edit buffer instead of carrying the previous typed name over.
      // A same-product hydration keeps the same key, preserving in-flight typing.
      <ProductNameHeader
        key={product.id}
        name={name}
        editMode={editMode}
        theme={theme}
        onProductNameChange={onProductNameChange}
      />
    );

    navigation.setOptions({
      title: needsCustomTitle ? undefined : truncateHeaderLabel(name, 36),
      headerLeft: (props: NativeStackHeaderBackProps) => (
        <HeaderBackButton {...props} onPress={goBackWithGuards} />
      ),
      headerTitle: needsCustomTitle
        ? () =>
            showTrail ? (
              <AncestorTrailHeader
                ancestors={ancestors}
                currentNameSlot={titleSlot}
                theme={theme}
              />
            ) : (
              titleSlot
            )
        : undefined,
      headerRight: undefined,
    });
  }, [
    ancestors,
    editMode,
    goBackWithGuards,
    isProductComponent,
    navigation,
    onProductNameChange,
    // The effect only reads product.name/id (both primitives, stable while
    // typing); depending on the whole `product` (a fresh useWatch reference
    // every render) re-ran setOptions on every keystroke.
    product.id,
    product.name,
    theme,
  ]);
}

/**
 * The one place the "is this product the one streaming?" rule lives. The page
 * header/FAB and the video section both need it; keeping it here stops them
 * silently diverging if the match rule ever changes (e.g. to a session id).
 */
export function getStreamingState(product: Product, activeStream: { productId: number } | null) {
  const streamingThisProduct =
    typeof product.id === 'number' && activeStream?.productId === product.id;
  return {
    streamingThisProduct,
    streamingOtherProduct: !!activeStream && !streamingThisProduct,
  };
}

export function getProductCapabilities({
  product,
  activeStream,
  rpiEnabled,
  youtubeEnabled,
  isGoogleLinked,
  isProductComponent,
}: {
  product: Product;
  activeStream: { productId: number } | null;
  rpiEnabled: boolean;
  youtubeEnabled: boolean;
  isGoogleLinked: boolean;
  isProductComponent: boolean;
}) {
  return {
    isProductComponent,
    rpiEnabled,
    youtubeEnabled,
    isGoogleLinked,
    ownedByMe: product.ownedBy === 'me',
    ...getStreamingState(product, activeStream),
  };
}

export function getPrimaryFabIcon({
  isSaving,
  showSavedIcon,
  editMode,
  theme,
}: {
  isSaving: boolean;
  showSavedIcon: boolean;
  editMode: boolean;
  theme: AppTheme;
}) {
  if (isSaving) return <ActivityIndicator color={theme.colors.onBackground} />;
  if (showSavedIcon) {
    // Icon doesn't forward testID (Lucide maps it to a data-testid attribute
    // RNTL can't query), so the "saved" integration test targets this wrapper.
    return (
      <View testID="icon-check-bold">
        <Icon name="check" color={theme.colors.onBackground} />
      </View>
    );
  }
  if (editMode) {
    return <Icon name="save" color={theme.colors.onBackground} />;
  }
  return <Icon name="pencil" color={theme.colors.onBackground} />;
}
