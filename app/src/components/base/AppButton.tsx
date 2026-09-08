import { Children, type ComponentProps, type ReactNode } from 'react';
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

// 'variant' is remapped via VARIANT_MAP; everything else passes through.
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
  // Bare RN text nodes must live inside <Text>. An interpolated label
  // ("Select all ({count})") arrives as an array of primitives; wrap the whole
  // run in one <Text> so it stays a single node (no flex gaps, one a11y label).
  const parts = Children.toArray(children);
  const isPrimitive = (c: unknown) => typeof c === 'string' || typeof c === 'number';
  const renderedChildren =
    parts.length > 0 && parts.every(isPrimitive) ? (
      <Text>{children}</Text>
    ) : (
      Children.map(children, (child) => (isPrimitive(child) ? <Text>{child}</Text> : child))
    );
  return (
    <Button
      variant={VARIANT_MAP[variant]}
      disabled={disabled || loading}
      // aria-*, not accessibilityState: only the aria props reach the DOM on web
      // (RN folds aria-disabled back into accessibilityState for native).
      aria-disabled={disabled || loading}
      // min-h-11 (44px tap floor) is a different tailwind-merge group than the
      // vendored h-10/sm:h-9, so it survives the merge.
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
