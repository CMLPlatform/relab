import { Platform, View } from 'react-native';
import { AppButton } from '@/components/base/AppButton';
import { AppText } from '@/components/base/AppText';
import { Fab } from '@/components/base/Fab';
import { Icon } from '@/components/base/Icon';
import { BOTTOM_NAV_CLEARANCE, useBottomNavVisible } from '@/components/base/useBottomNav';
import { useAppTheme } from '@/theme';
import { getErrorMessage } from '@/utils/errors';
import { PRODUCTS_FAB_EDGE_GAP, productsScreenStyles as styles } from './shared';

type ProductsErrorBannerProps = {
  error: unknown;
  onRetry: () => void;
};

type ProductsFabProps = {
  extended: boolean;
  creationState: 'guest' | 'unverified' | 'verified';
  onPress: () => void;
};

const CREATION_LABELS: Record<ProductsFabProps['creationState'], string> = {
  guest: 'Sign in to add product',
  unverified: 'Verify email to add product',
  verified: 'New product',
};

export function ProductsErrorBanner({ error, onRetry }: ProductsErrorBannerProps) {
  const theme = useAppTheme();

  if (!error) return null;

  return (
    <View className="flex-row items-center gap-3 rounded-lg p-4 bg-destructive/10">
      <Icon name="circle-alert" size="lg" color={theme.colors.error} />
      <View className="flex-1">
        <AppText className="font-bold text-destructive">Couldn't load products</AppText>
        <AppText variant="caption" className="opacity-80 text-destructive">
          {getErrorMessage(error, 'Something went wrong loading products.')}
        </AppText>
      </View>
      <AppButton variant="tonal" onPress={onRetry} accessibilityLabel="Retry loading products">
        Retry
      </AppButton>
    </View>
  );
}

/** The FAB stays enabled in every state; its label names the next step (sign in, verify, add). */
export function ProductsFab({ extended, creationState, onPress }: ProductsFabProps) {
  const bottomNavVisible = useBottomNavVisible();
  const label = CREATION_LABELS[creationState];
  // Only the ordinary verified-user action may collapse to the plus icon on scroll.
  const showLabel = extended || creationState !== 'verified';
  // Web-only: BottomNav is viewport-fixed there; on native the container already shrinks.
  const bottomOffset = Platform.OS === 'web' && bottomNavVisible ? BOTTOM_NAV_CLEARANCE : 0;

  return (
    <Fab
      icon="plus"
      label={label}
      extended={showLabel}
      onPress={onPress}
      style={[styles.fab, { bottom: PRODUCTS_FAB_EDGE_GAP + bottomOffset }]}
      accessibilityLabel={label}
    />
  );
}
