import { cva, type VariantProps } from 'class-variance-authority';
import { Platform, Pressable } from 'react-native';
import { TextClassContext } from '@/components/base/ui/text';
import { WEB_FOCUS_RING } from '@/constants';
import { cn } from '@/utils/cn';

const buttonVariants = cva(
  cn(
    // The 44px tap floor (min-h-11) is not negotiable (DESIGN.md, MIN_TAP_TARGET).
    'group min-h-11 shrink-0 flex-row items-center justify-center gap-2 rounded-md px-4 py-2 shadow-none',
    Platform.select({
      web: cn(
        "has-[>svg]:px-3 cursor-pointer aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive whitespace-nowrap outline-none transition-[color,background-color,border-color,box-shadow,opacity] disabled:pointer-events-none [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0",
        WEB_FOCUS_RING,
      ),
    }),
  ),
  {
    variants: {
      variant: {
        // Pressed/hover use `primary-strong`, not alpha on primary (Primary-Strong Rule).
        primary: cn(
          'bg-primary active:bg-primary-strong',
          Platform.select({ web: 'hover:bg-primary-strong' }),
        ),
        destructive: cn(
          'bg-destructive active:bg-destructive/90',
          Platform.select({
            web: 'hover:bg-destructive/90',
          }),
        ),
        outline: cn(
          'border-border bg-background active:bg-primary/12 dark:bg-input/30 dark:border-input border',
          Platform.select({
            web: 'hover:bg-primary/12',
          }),
        ),
        // Soft-primary fill: low-emphasis-but-filled CTA (flat, no shadow).
        tonal: cn(
          'bg-primary/12 active:bg-primary-strong',
          Platform.select({ web: 'hover:bg-primary-strong' }),
        ),
        ghost: cn('active:bg-primary/12', Platform.select({ web: 'hover:bg-primary/12' })),
      },
    },
    defaultVariants: {
      variant: 'primary',
    },
  },
);

const buttonTextVariants = cva(
  cn(
    // NOTE: text-sm is the vendored button size; relabelling every button to the label ramp step is out of scope.
    'text-foreground text-sm font-medium',
    Platform.select({ web: 'pointer-events-none transition-colors' }),
  ),
  {
    variants: {
      variant: {
        primary: 'text-primary-foreground',
        destructive: 'text-destructive-foreground',
        outline: cn(
          'group-active:text-primary',
          Platform.select({ web: 'group-hover:text-primary' }),
        ),
        tonal: cn(
          'text-primary group-active:text-primary-foreground',
          Platform.select({ web: 'group-hover:text-primary-foreground' }),
        ),
        ghost: cn(
          'group-active:text-primary',
          Platform.select({ web: 'group-hover:text-primary' }),
        ),
      },
    },
    defaultVariants: {
      variant: 'primary',
    },
  },
);

type ButtonProps = React.ComponentProps<typeof Pressable> & VariantProps<typeof buttonVariants>;

export function Button({ className, variant, ...props }: ButtonProps) {
  return (
    <TextClassContext.Provider value={buttonTextVariants({ variant })}>
      <Pressable
        className={cn(props.disabled && 'opacity-50', buttonVariants({ variant }), className)}
        role="button"
        {...props}
      />
    </TextClassContext.Provider>
  );
}
