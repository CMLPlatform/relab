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
 * `maxFontSizeMultiplier` defaults to the app-wide Dynamic Type cap (2x), as in
 * `AppText`. This primitive renders every AppButton label plus HeroStats,
 * ComponentRow, GoLiveDialog and ProductDelete, so the cap must live here too.
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
