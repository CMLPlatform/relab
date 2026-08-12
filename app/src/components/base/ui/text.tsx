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

function Text({
  className,
  asChild = false,
  ...props
}: React.ComponentProps<typeof RNText> &
  React.RefAttributes<typeof RNText> & {
    asChild?: boolean;
  }) {
  const textClass = React.useContext(TextClassContext);
  const Component = asChild ? Slot : RNText;
  return <Component className={cn(TEXT_CLASS_NAME, textClass, className)} {...props} />;
}

export { Text, TextClassContext };
