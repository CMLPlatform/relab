import { Platform } from 'react-native';
import { ErrorState } from '@/components/base/ErrorState';
import { Fab } from '@/components/base/Fab';
import { BOTTOM_NAV_CLEARANCE, useBottomNavVisible } from '@/components/base/useBottomNav';
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
  if (!error) return null;

  return (
    <ErrorState
      compact
      title="Couldn't load products"
      message={getErrorMessage(error, 'Check your connection and try again.')}
      onRetry={onRetry}
      actionAccessibilityLabel="Retry loading products"
    />
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
