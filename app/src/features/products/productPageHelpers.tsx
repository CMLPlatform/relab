import type { NativeStackHeaderBackProps } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, Platform, View } from 'react-native';
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
    // VoiceOver ignores accessibilityLiveRegion; Android and web read the
    // live region ProductDetailScreen renders from `justSaved`.
    if (Platform.OS === 'ios') AccessibilityInfo.announceForAccessibility('Saved');

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
}) {
  // Depend on product.name only; `product` is a fresh useWatch reference every render.
  const name = product.name;
  // Components fall through to the ancestor trail's custom title slot.
  const showTrail = isProductComponent && ancestors.length > 0;

  // Also rendered in-page by PageHeaderRow at lg, where the stack header hides.
  const headerTitle = useMemo(
    () =>
      showTrail ? (
        <AncestorTrailHeader
          ancestors={ancestors}
          currentNameSlot={<ProductNameHeader name={name} />}
          theme={theme}
        />
      ) : (
        <ProductNameHeader name={name} />
      ),
    [ancestors, name, showTrail, theme],
  );

  useEffect(() => {
    navigation.setOptions({
      title: showTrail ? undefined : truncateHeaderLabel(name, 36),
      headerLeft: (props: NativeStackHeaderBackProps) => (
        <HeaderBackButton {...props} onPress={goBackWithGuards} />
      ),
      headerTitle: showTrail ? () => headerTitle : undefined,
      headerRight: undefined,
    });
  }, [goBackWithGuards, headerTitle, name, navigation, showTrail]);

  return headerTitle;
}

/** The one place the "is this product the one streaming?" rule lives. */
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
  isPaused,
  showSavedIcon,
  editMode,
  theme,
}: {
  isSaving: boolean;
  isPaused: boolean;
  showSavedIcon: boolean;
  editMode: boolean;
  theme: AppTheme;
}) {
  // Paused (offline, queued) is not loading: the queued clock replaces the spinner.
  if (isSaving && isPaused) return <Icon name="clock" color={theme.colors.onBackground} />;
  if (isSaving) return <ActivityIndicator color={theme.colors.onBackground} />;
  if (showSavedIcon) {
    // Icon does not forward testID in a way RNTL can query; the test targets this wrapper.
    return (
      <View testID="icon-check">
        <Icon name="check" color={theme.colors.onBackground} />
      </View>
    );
  }
  if (editMode) {
    return <Icon name="save" color={theme.colors.onBackground} />;
  }
  return <Icon name="pencil" color={theme.colors.onBackground} />;
}
