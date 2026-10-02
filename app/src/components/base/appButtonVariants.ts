import type { AppColors } from '@/theme/types';

export type AppButtonVariant = 'primary' | 'tonal' | 'outline' | 'ghost' | 'destructive';

// Mirrors buttonTextVariants' per-variant text color (ui/button.tsx) for the
// spinner and caller-composed icons. Not in AppButton.tsx (Fast Refresh).
export const VARIANT_FOREGROUND_COLOR: Record<AppButtonVariant, (colors: AppColors) => string> = {
  primary: (colors) => colors.onPrimary,
  tonal: (colors) => colors.primary,
  outline: (colors) => colors.primary,
  ghost: (colors) => colors.primary,
  destructive: (colors) => colors.onError,
};
