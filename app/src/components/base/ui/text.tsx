import { Slot } from '@rn-primitives/slot';
import * as React from 'react';
import { Platform, Text as RNText } from 'react-native';
import { cn } from '@/utils/cn';

const TEXT_CLASS_NAME = cn(
  'text-foreground text-base',
  Platform.select({
    web: 'select-text',
  }),
);

const TextClassContext = React.createContext<string | undefined>(undefined);

/**
 * `maxFontSizeMultiplier` defaults to the same app-wide Dynamic Type cap (2x)
 * that `AppText` applies.
 *
 * DESIGN.md states the cap is app-wide, and it was not: this vendored primitive
 * renders user-facing copy in HeroStats, ComponentRow, GoLiveDialog,
 * ProductDelete and every AppButton label, and carried no cap at all, so those
 * strings scaled without limit and broke fixed layouts. Defaulting it here fixes
 * every consumer at once; a caller that genuinely wants unbounded scaling can
 * still pass its own value.
 */
function Text({
  className,
  asChild = false,
  maxFontSizeMultiplier = 2,
  ...props
}: React.ComponentProps<typeof RNText> &
  React.RefAttributes<typeof RNText> & {
    asChild?: boolean;
  }) {
  const textClass = React.useContext(TextClassContext);
  const Component = asChild ? Slot : RNText;
  return (
    <Component
      className={cn(TEXT_CLASS_NAME, textClass, className)}
      maxFontSizeMultiplier={maxFontSizeMultiplier}
      {...props}
    />
  );
}

export { Text, TextClassContext };
