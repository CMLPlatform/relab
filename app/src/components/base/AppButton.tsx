import type { ComponentProps, ReactNode } from 'react';
import { ActivityIndicator, View } from 'react-native';
import {
  type AppButtonVariant,
  VARIANT_FOREGROUND_COLOR,
} from '@/components/base/appButtonVariants';
import { Button } from '@/components/base/ui/button';
import { Text } from '@/components/base/ui/text';
import { useAppTheme } from '@/theme';
import { cn } from '@/utils/cn';

type RnrVariant = ComponentProps<typeof Button>['variant'];

const VARIANT_MAP: Record<AppButtonVariant, RnrVariant> = {
  primary: 'default',
  tonal: 'tonal',
  outline: 'outline',
  ghost: 'ghost',
  destructive: 'destructive',
};

// Omit 'variant' from the vendored button's props: AppButton remaps its own
// app-level variant names to the RNR ones via VARIANT_MAP. Everything else
// (accessibilityHint, accessibilityState, aria-*, onLongPress, ...) passes
// through via `...rest` so callers aren't limited to the props this file
// happened to name explicitly.
type AppButtonProps = Omit<ComponentProps<typeof Button>, 'variant'> & {
  variant?: AppButtonVariant;
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
        {loading ? (
          <ActivityIndicator size="small" color={VARIANT_FOREGROUND_COLOR[variant](colors)} />
        ) : null}
        {renderedChildren}
      </View>
    </Button>
  );
}
