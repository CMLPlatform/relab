import { Platform, View } from 'react-native';
import { AppButton } from '@/components/base/AppButton';
import { AppText } from '@/components/base/AppText';
import { Fab } from '@/components/base/Fab';
import { Icon } from '@/components/base/Icon';
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
    <View
      className="flex-row items-center gap-3 rounded-lg p-4"
      style={{ backgroundColor: theme.colors.errorContainer }}
    >
      <Icon name="alert-circle-outline" size="lg" color={theme.colors.error} />
      <View className="flex-1">
        <AppText className="font-bold" style={{ color: theme.colors.onErrorContainer }}>
          Load Failed
        </AppText>
        <AppText
          className="opacity-80"
          style={[styles.errorMessage, { color: theme.colors.onErrorContainer }]}
        >
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

  return (
    <Fab
      icon="plus"
      label="New product"
      extended={extended}
      onPress={onPress}
      style={[
        styles.fab,
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
