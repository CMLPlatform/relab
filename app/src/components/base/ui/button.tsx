import { cva, type VariantProps } from 'class-variance-authority';
import { Platform, Pressable } from 'react-native';
import { TextClassContext } from '@/components/base/ui/text';
import { WEB_FOCUS_RING } from '@/constants';
import { cn } from '@/utils/cn';

const buttonVariants = cva(
  cn(
    'group min-h-11 shrink-0 flex-row items-center justify-center gap-2 rounded-md shadow-none',
    Platform.select({
      web: cn(
        "cursor-pointer aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive whitespace-nowrap outline-none transition-[color,background-color,border-color,box-shadow,opacity] disabled:pointer-events-none [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0",
        WEB_FOCUS_RING,
      ),
    }),
  ),
  {
    variants: {
      variant: {
        // Pressed/hover use `primary-strong`, not alpha on primary (Primary-Strong Rule).
        default: cn(
          'bg-primary active:bg-primary-strong',
          Platform.select({ web: 'hover:bg-primary-strong' }),
        ),
        destructive: cn(
          'bg-destructive active:bg-destructive/90 dark:bg-destructive/60',
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
        secondary: cn(
          'bg-secondary active:bg-secondary/80',
          Platform.select({ web: 'hover:bg-secondary/80' }),
        ),
        // Soft-primary fill: low-emphasis-but-filled CTA (flat, no shadow).
        tonal: cn(
          'bg-primary/12 active:bg-primary/20',
          Platform.select({ web: 'hover:bg-primary/20' }),
        ),
        ghost: cn('active:bg-primary/12', Platform.select({ web: 'hover:bg-primary/12' })),
        link: '',
      },
      size: {
        // Sizes vary padding only: the 44px tap floor (min-h-11 above) is not
        // negotiable at any breakpoint (DESIGN.md, MIN_TAP_TARGET).
        default: cn('px-4 py-2', Platform.select({ web: 'has-[>svg]:px-3' })),
        sm: cn('gap-1.5 px-3', Platform.select({ web: 'has-[>svg]:px-2.5' })),
        lg: cn('px-6', Platform.select({ web: 'has-[>svg]:px-4' })),
        icon: 'h-11 w-11',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

const buttonTextVariants = cva(
  cn(
    'text-foreground text-sm font-medium',
    Platform.select({ web: 'pointer-events-none transition-colors' }),
  ),
  {
    variants: {
      variant: {
        default: 'text-primary-foreground',
        destructive: 'text-white',
        outline: cn(
          'group-active:text-primary',
          Platform.select({ web: 'group-hover:text-primary' }),
        ),
        secondary: 'text-secondary-foreground',
        tonal: 'text-primary',
        ghost: cn(
          'group-active:text-primary',
          Platform.select({ web: 'group-hover:text-primary' }),
        ),
        link: cn(
          'text-primary group-active:underline',
          Platform.select({ web: 'underline-offset-4 hover:underline group-hover:underline' }),
        ),
      },
      size: {
        default: '',
        sm: '',
        lg: '',
        icon: '',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

type ButtonProps = React.ComponentProps<typeof Pressable> &
  React.RefAttributes<typeof Pressable> &
  VariantProps<typeof buttonVariants>;

function Button({ className, variant, size, ...props }: ButtonProps) {
  return (
    <TextClassContext.Provider value={buttonTextVariants({ variant, size })}>
      <Pressable
        className={cn(props.disabled && 'opacity-50', buttonVariants({ variant, size }), className)}
        role="button"
        {...props}
      />
    </TextClassContext.Provider>
  );
}

export type { ButtonProps };
export { Button, buttonTextVariants, buttonVariants };
