import type { AppColors } from '@/theme';

export type AppButtonVariant = 'primary' | 'tonal' | 'outline' | 'ghost' | 'destructive';

// Mirrors buttonTextVariants' per-variant text color (ui/button.tsx), so the
// loading spinner — and any caller composing its own icon inside an AppButton
// (see ProductDelete) — matches the label instead of a hand-picked color.
// Split out of AppButton.tsx: that file must export components only (Fast
// Refresh), and this constant isn't one.
export const VARIANT_FOREGROUND_COLOR: Record<AppButtonVariant, (colors: AppColors) => string> = {
  primary: (colors) => colors.onPrimary,
  tonal: (colors) => colors.primary,
  outline: (colors) => colors.onSurface,
  ghost: (colors) => colors.onSurface,
  destructive: () => '#FFFFFF', // buttonTextVariants hard-codes text-white for destructive
};
