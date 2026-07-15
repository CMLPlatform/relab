import type { ComponentProps, ReactNode } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Button } from '@/components/base/ui/button';
import { Text } from '@/components/base/ui/text';
import { type AppColors, useAppTheme } from '@/theme';
import { cn } from '@/utils/cn';

type RnrVariant = ComponentProps<typeof Button>['variant'];

const VARIANT_MAP = {
  primary: 'default',
  tonal: 'tonal',
  outline: 'outline',
  ghost: 'ghost',
  destructive: 'destructive',
} as const satisfies Record<string, RnrVariant>;

// Mirrors buttonTextVariants' per-variant text color (ui/button.tsx) so the
// loading spinner matches the label instead of a hard-coded default.
const SPINNER_COLOR: Record<keyof typeof VARIANT_MAP, (colors: AppColors) => string> = {
  primary: (colors) => colors.onPrimary,
  tonal: (colors) => colors.primary,
  outline: (colors) => colors.onSurface,
  ghost: (colors) => colors.onSurface,
  destructive: () => '#FFFFFF', // buttonTextVariants hard-codes text-white for destructive
};

type AppButtonProps = {
  variant?: keyof typeof VARIANT_MAP;
  loading?: boolean;
  disabled?: boolean;
  onPress?: () => void;
  children: ReactNode;
  className?: string;
  accessibilityLabel?: string;
};

/** App button over the vendored RNR button; maps app variants and a loading state. */
export function AppButton({
  variant = 'primary',
  loading = false,
  disabled = false,
  onPress,
  children,
  className,
  accessibilityLabel,
}: AppButtonProps) {
  const { colors } = useAppTheme();
  return (
    <Button
      variant={VARIANT_MAP[variant]}
      disabled={disabled || loading}
      onPress={onPress}
      accessibilityLabel={accessibilityLabel}
      // min-h-11 (44px) is a different tailwind-merge group than the vendored
      // button's h-10/sm:h-9 size classes, so it survives the merge and — since
      // min-height clamps height from below — always wins the actual layout,
      // keeping every AppButton at the 44px a11y tap-target floor.
      className={cn('min-h-11', className)}
    >
      <View className="flex-row items-center gap-2">
        {loading ? <ActivityIndicator size="small" color={SPINNER_COLOR[variant](colors)} /> : null}
        {typeof children === 'string' ? <Text>{children}</Text> : children}
      </View>
    </Button>
  );
}
