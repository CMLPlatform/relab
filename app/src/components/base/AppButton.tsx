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

// Omit 'variant' from the vendored button's props: AppButton remaps its own
// app-level variant names to the RNR ones via VARIANT_MAP. Everything else
// (accessibilityHint, accessibilityState, aria-*, onLongPress, ...) passes
// through via `...rest` so callers aren't limited to the props this file
// happened to name explicitly.
type AppButtonProps = Omit<ComponentProps<typeof Button>, 'variant'> & {
  variant?: keyof typeof VARIANT_MAP;
  loading?: boolean;
  children: ReactNode;
};

/** App button over the vendored RNR button; maps app variants and a loading state. */
export function AppButton({
  variant = 'primary',
  loading = false,
  disabled = false,
  children,
  className,
  ...rest
}: AppButtonProps) {
  const { colors } = useAppTheme();
  // Bare RN text nodes must live inside <Text>; wrap primitive children so a numeric or
  // string label renders safely. Anything else (an element, null, or a boolean, which
  // React already renders as nothing) passes through untouched.
  const renderedChildren =
    typeof children === 'string' || typeof children === 'number' ? (
      <Text>{children}</Text>
    ) : (
      children
    );
  return (
    <Button
      variant={VARIANT_MAP[variant]}
      disabled={disabled || loading}
      // min-h-11 (44px) is a different tailwind-merge group than the vendored
      // button's h-10/sm:h-9 size classes, so it survives the merge and — since
      // min-height clamps height from below — always wins the actual layout,
      // keeping every AppButton at the 44px a11y tap-target floor.
      className={cn('min-h-11', className)}
      {...rest}
    >
      <View className="flex-row items-center gap-2">
        {loading ? <ActivityIndicator size="small" color={SPINNER_COLOR[variant](colors)} /> : null}
        {renderedChildren}
      </View>
    </Button>
  );
}
