import { Slot } from '@rn-primitives/slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { Platform, View } from 'react-native';
import { TextClassContext } from '@/components/base/ui/text';
import { cn } from '@/utils/cn';

const badgeVariants = cva(
  cn(
    'border-border group shrink-0 flex-row items-center justify-center gap-1 overflow-hidden rounded-full border px-2 py-0.5',
    Platform.select({
      // No focus styling: Badge is a static label here (ComponentRow, HeroStats),
      // never focusable. The upstream ring-based focus styling was dead, and a ring
      // is the wrong mechanism on this codebase anyway — see WEB_FOCUS_RING. If a
      // badge ever becomes interactive, compose WEB_FOCUS_RING rather than a ring.
      web: 'aria-invalid:border-destructive w-fit whitespace-nowrap transition-[color,box-shadow] [&>svg]:pointer-events-none [&>svg]:size-3',
    }),
  ),
  {
    variants: {
      variant: {
        default: cn(
          'bg-primary border-transparent',
          Platform.select({ web: '[a&]:hover:bg-primary/90' }),
        ),
        secondary: cn(
          'bg-secondary border-transparent',
          Platform.select({ web: '[a&]:hover:bg-secondary/90' }),
        ),
        destructive: cn(
          'bg-destructive border-transparent',
          Platform.select({ web: '[a&]:hover:bg-destructive/90' }),
        ),
        outline: Platform.select({ web: '[a&]:hover:bg-accent [a&]:hover:text-accent-foreground' }),
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

const badgeTextVariants = cva('text-xs font-medium', {
  variants: {
    variant: {
      default: 'text-primary-foreground',
      secondary: 'text-secondary-foreground',
      destructive: 'text-white',
      outline: 'text-foreground',
    },
  },
  defaultVariants: {
    variant: 'default',
  },
});

type BadgeProps = React.ComponentProps<typeof View> &
  React.RefAttributes<View> & {
    asChild?: boolean;
  } & VariantProps<typeof badgeVariants>;

function Badge({ className, variant, asChild, ...props }: BadgeProps) {
  const Component = asChild ? Slot : View;
  return (
    <TextClassContext.Provider value={badgeTextVariants({ variant })}>
      <Component className={cn(badgeVariants({ variant }), className)} {...props} />
    </TextClassContext.Provider>
  );
}

export type { BadgeProps };
export { Badge, badgeTextVariants, badgeVariants };
