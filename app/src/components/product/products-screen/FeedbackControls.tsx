import { Platform, View } from 'react-native';
import { AppButton } from '@/components/base/AppButton';
import { AppText } from '@/components/base/AppText';
import { Fab } from '@/components/base/Fab';
import { Icon } from '@/components/base/Icon';
import { BOTTOM_NAV_CLEARANCE, useBottomNavVisible } from '@/components/base/useBottomNav';
import { useAppTheme } from '@/theme';
import { getErrorMessage } from '@/utils/errors';
import { productsScreenStyles as styles } from './shared';

type ProductsErrorBannerProps = {
  error: unknown;
  onRetry: () => void;
};

type ProductsFabProps = {
  extended: boolean;
  highlight: boolean;
  onPress: () => void;
};

export function ProductsErrorBanner({ error, onRetry }: ProductsErrorBannerProps) {
  const theme = useAppTheme();

  if (!error) return null;

  return (
    <View className="flex-row items-center gap-3 rounded-lg p-4 bg-destructive/10">
      <Icon name="circle-alert" size="lg" color={theme.colors.error} />
      <View className="flex-1">
        <AppText className="font-bold text-destructive">Load Failed</AppText>
        <AppText className="opacity-80 text-destructive" style={styles.errorMessage}>
          {getErrorMessage(error, 'Something went wrong loading products.')}
        </AppText>
      </View>
      <AppButton variant="tonal" onPress={onRetry} accessibilityLabel="Retry loading products">
        Retry
      </AppButton>
    </View>
  );
}

/**
 * The fab never dims or relabels for guests: it is fully enabled for them, and
 * `createProductAction` explains the sign-in gate on press. Dimming a working
 * control reads as disabled, and the accessible name must contain the visible
 * label (WCAG 2.5.3) — so both stay constant.
 */
export function ProductsFab({ extended, highlight, onPress }: ProductsFabProps) {
  const theme = useAppTheme();
  const bottomNavVisible = useBottomNavVisible();
  // Web-only: BottomNav is viewport-fixed there and escapes the container the
  // fab is laid out in, so the fab needs the clearance bump itself. On native
  // BottomNav is in normal flow, so the container already shrinks — no bump.
  const bottomOffset = Platform.OS === 'web' && bottomNavVisible ? BOTTOM_NAV_CLEARANCE : 0;

  return (
    <Fab
      icon="plus"
      label="New product"
      extended={extended}
      onPress={onPress}
      style={[
        styles.fab,
        { bottom: 16 + bottomOffset },
        {
          borderWidth: highlight ? 1 : 0,
          borderColor: highlight ? theme.colors.primaryContainer : 'transparent',
          ...(Platform.OS === 'web'
            ? highlight
              ? { boxShadow: `0px 0px 10px ${theme.colors.primary}` }
              : {}
            : {
                shadowColor: highlight ? theme.colors.primary : undefined,
                shadowOpacity: highlight ? 0.22 : 0,
                shadowRadius: highlight ? 10 : 0,
              }),
        },
      ]}
      accessibilityLabel="New product"
    />
  );
}
