import { MaterialCommunityIcons } from '@expo/vector-icons';
import { HeaderBackButton, type HeaderBackButtonProps } from '@react-navigation/elements';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator } from 'react-native';
import type { MD3Theme } from 'react-native-paper';
import { AncestorTrailHeader } from '@/hooks/products/AncestorTrailHeader';
import { ProductNameHeader } from '@/hooks/products/ProductNameHeader';
import { truncateHeaderLabel } from '@/hooks/products/truncateHeaderLabel';
import type { AncestorCrumb } from '@/hooks/products/useAncestorTrail';
import type { useAppFeedback } from '@/hooks/useAppFeedback';
import type { Product } from '@/types/Product';

export { truncateHeaderLabel };

export function useSlowLoading(isLoading: boolean) {
  const [slowLoading, setSlowLoading] = useState(false);

  useEffect(() => {
    if (!isLoading) {
      return;
    }

    const resetTimer = setTimeout(() => setSlowLoading(false), 0);
    const timer = setTimeout(() => setSlowLoading(true), 5000);
    return () => {
      clearTimeout(resetTimer);
      clearTimeout(timer);
    };
  }, [isLoading]);

  return isLoading && slowLoading;
}

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

export function useStreamPrompt({
  activeStream,
  feedback,
  isNew,
  isProductComponent,
}: {
  activeStream: { productName: string } | null;
  feedback: ReturnType<typeof useAppFeedback>;
  isNew: boolean;
  isProductComponent: boolean;
}) {
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
      headerLeft?: (props: HeaderBackButtonProps) => React.ReactNode;
      headerTitle?: (() => React.ReactNode) | undefined;
      headerRight?: (() => React.ReactNode) | undefined;
    }) => void;
  };
  goBackWithGuards: () => void;
  product: Product;
  ancestors: AncestorCrumb[];
  isProductComponent: boolean;
  theme: MD3Theme;
  editMode: boolean;
  onProductNameChange?: (newName: string) => void;
}) {
  useEffect(() => {
    const name = product?.name ?? '';
    const showTrail = isProductComponent && ancestors.length > 0;
    // In edit mode the header *is* the name field, so always render a custom
    // title (input). In view mode, a plain-string title is enough for base
    // products; components fall through to the ancestor trail.
    const needsCustomTitle = editMode || showTrail;

    const titleSlot = (
      <ProductNameHeader
        name={name}
        editMode={editMode}
        theme={theme}
        onProductNameChange={onProductNameChange}
      />
    );

    navigation.setOptions({
      title: needsCustomTitle ? undefined : truncateHeaderLabel(name, 36),
      headerLeft: (props: HeaderBackButtonProps) => (
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
    product,
    theme,
  ]);
}

export function getProductCapabilities({
  product,
  activeStream,
  rpiEnabled,
  youtubeEnabled,
  isGoogleLinked,
  isNew,
  isProductComponent,
}: {
  product: Product;
  activeStream: { productId: number } | null;
  rpiEnabled: boolean;
  youtubeEnabled: boolean;
  isGoogleLinked: boolean;
  isNew: boolean;
  isProductComponent: boolean;
}) {
  const streamingThisProduct =
    typeof product.id === 'number' && activeStream?.productId === product.id;

  return {
    isNew,
    isProductComponent,
    rpiEnabled,
    youtubeEnabled,
    isGoogleLinked,
    ownedByMe: product.ownedBy === 'me',
    streamingThisProduct,
    streamingOtherProduct: !!activeStream && !streamingThisProduct,
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
  theme: MD3Theme;
}) {
  if (isSaving) return <ActivityIndicator color={theme.colors.onBackground} />;
  if (showSavedIcon) {
    return <MaterialCommunityIcons name="check-bold" size={20} color={theme.colors.onBackground} />;
  }
  if (editMode) {
    return (
      <MaterialCommunityIcons name="content-save" size={20} color={theme.colors.onBackground} />
    );
  }
  return <MaterialCommunityIcons name="pencil" size={20} color={theme.colors.onBackground} />;
}
