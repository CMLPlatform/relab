import * as TogglePrimitive from '@rn-primitives/toggle';
import { cva, type VariantProps } from 'class-variance-authority';
import type * as React from 'react';
import { Platform } from 'react-native';
import { TextClassContext } from '@/components/base/ui/text';
import { WEB_FOCUS_RING } from '@/constants';
import { cn } from '@/utils/cn';

const toggleVariants = cva(
  cn(
    'active:bg-muted group min-h-11 flex flex-row items-center justify-center gap-2 rounded-md',
    Platform.select({
      web: cn(
        'hover:bg-muted hover:text-muted-foreground aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive inline-flex cursor-default whitespace-nowrap outline-none transition-[color,box-shadow] disabled:pointer-events-none [&_svg]:pointer-events-none',
        WEB_FOCUS_RING,
      ),
    }),
  ),
  {
    variants: {
      variant: {
        default: 'bg-transparent',
        outline: cn(
          'border-input active:bg-accent border bg-transparent',
          // NOTE: shadow removed per DESIGN.md flat elevation; upstream RNR ships one
          Platform.select({
            web: 'hover:bg-accent hover:text-accent-foreground',
          }),
        ),
      },
      size: {
        // Width and padding vary; the 44px floor (min-h-11 above) does not.
        default: 'min-w-11 px-2.5',
        sm: 'min-w-11 px-2',
        lg: 'min-w-11 px-3',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

function Toggle({
  className,
  variant,
  size,
  ...props
}: React.ComponentProps<typeof TogglePrimitive.Root> & VariantProps<typeof toggleVariants>) {
  return (
    <TextClassContext.Provider
      value={cn(
        'text-sm text-foreground font-medium',
        props.pressed
          ? 'text-primary'
          : Platform.select({ web: 'group-hover:text-muted-foreground' }),
        className,
      )}
    >
      <TogglePrimitive.Root
        className={cn(
          toggleVariants({ variant, size }),
          props.disabled && 'opacity-50',
          props.pressed && 'bg-primary/12',
          className,
        )}
        {...props}
      />
    </TextClassContext.Provider>
  );
}

export { Toggle, toggleVariants };
