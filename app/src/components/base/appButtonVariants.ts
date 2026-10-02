import { alpha } from '@/theme/color';
import type { AppColors, AppTheme } from '@/theme/types';

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

/**
 * The one disabled treatment (ui/button.tsx's DISABLED_CLASS and DISABLED_TEXT_CLASS) as
 * style values, for a control styled inline rather than through the button classes.
 */
export function disabledTreatment({ colors, tokens }: AppTheme) {
  return {
    fill: alpha(colors.muted, 0.5),
    border: tokens.border.subtle,
    ink: alpha(colors.mutedForeground, 0.6),
  };
}
