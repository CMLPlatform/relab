import type { ComponentProps, ReactNode } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Button } from '@/components/base/ui/button';
import { AppText } from './AppText';

type RnrVariant = ComponentProps<typeof Button>['variant'];

const VARIANT_MAP = {
  primary: 'default',
  outline: 'outline',
  ghost: 'ghost',
  destructive: 'destructive',
} as const satisfies Record<string, RnrVariant>;

type AppButtonProps = {
  variant?: keyof typeof VARIANT_MAP;
  loading?: boolean;
  disabled?: boolean;
  onPress?: () => void;
  children: ReactNode;
  className?: string;
};

/** App button over the vendored RNR button; maps app variants and a loading state. */
export function AppButton({
  variant = 'primary',
  loading = false,
  disabled = false,
  onPress,
  children,
  className,
}: AppButtonProps) {
  return (
    <Button
      variant={VARIANT_MAP[variant]}
      disabled={disabled || loading}
      onPress={onPress}
      className={className}
    >
      <View className="flex-row items-center gap-2">
        {loading ? <ActivityIndicator size="small" /> : null}
        {typeof children === 'string' ? <AppText>{children}</AppText> : children}
      </View>
    </Button>
  );
}
