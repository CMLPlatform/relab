import { MaterialCommunityIcons } from '@expo/vector-icons';
import { HeaderBackButton, type HeaderBackButtonProps } from '@react-navigation/elements';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import type { MD3Theme } from 'react-native-paper';
import { Button, Text } from 'react-native-paper';
import { useDialog } from '@/components/common/DialogProvider';
import { useAppFeedback } from '@/hooks/useAppFeedback';
import { getProductNameHelperText, productSchema } from '@/services/api/validation/productSchema';
import type { Product } from '@/types/Product';

export function truncateHeaderLabel(value: string | undefined, maxLength: number): string {
  if (!value) return 'Product';
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

export function useSlowLoading(isLoading: boolean) {
  const [slowLoading, setSlowLoading] = useState(false);

  useEffect(() => {
    if (!isLoading) {
      setSlowLoading(false);
      return;
    }
    const timer = setTimeout(() => setSlowLoading(true), 5000);
    return () => clearTimeout(timer);
  }, [isLoading]);

  return slowLoading;
}

export function useSavedIndicator(justSaved: boolean) {
  const [showSavedIcon, setShowSavedIcon] = useState(false);

  useEffect(() => {
    if (!justSaved) return;
    setShowSavedIcon(true);
    const timer = setTimeout(() => setShowSavedIcon(false), 3000);
    return () => clearTimeout(timer);
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
  parentProduct,
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
  parentProduct?: Product;
  isProductComponent: boolean;
  theme: MD3Theme;
  editMode: boolean;
  onProductNameChange?: (newName: string) => void;
}) {
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
}

export function getProductCapabilities({
  product,
  activeStream,
  rpiEnabled,
  youtubeEnabled,
  isGoogleLinked,
  isNew,
  isProductComponent,
  justCreated,
}: {
  product: Product;
  activeStream: { productId: number } | null;
  rpiEnabled: boolean;
  youtubeEnabled: boolean;
  isGoogleLinked: boolean;
  isNew: boolean;
  isProductComponent: boolean;
  justCreated: boolean;
}) {
  const streamingThisProduct =
    typeof product.id === 'number' && activeStream?.productId === product.id;

  return {
    isNew,
    isProductComponent,
    justCreated,
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

function EditNameButton({
  product,
  onProductNameChange,
}: {
  product: Product | undefined;
  onProductNameChange?: (newName: string) => void;
}) {
  const dialog = useDialog();
  const feedback = useAppFeedback();

  return (
    <Button
      onPress={() => {
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
      }}
    >
      Edit name
    </Button>
  );
}
