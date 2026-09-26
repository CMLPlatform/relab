import { cva, type VariantProps } from 'class-variance-authority';
import { Platform, View } from 'react-native';
import { TextClassContext } from '@/components/base/ui/text';
import { cn } from '@/utils/cn';

// Status-pill shape (DESIGN.md): radius.control, not `rounded-full`; the
// True-Pill Rule keeps the full radius for avatars.
const badgeVariants = cva(
  cn(
    'border-border group shrink-0 flex-row items-center justify-center gap-1 overflow-hidden rounded-md border px-2 py-0.5',
    Platform.select({
      // No focus styling: Badge is never focusable. If it becomes interactive,
      // compose WEB_FOCUS_RING, not a ring.
      web: 'aria-invalid:border-destructive w-fit whitespace-nowrap transition-[color,box-shadow] [&>svg]:pointer-events-none [&>svg]:size-3',
    }),
  ),
  {
    variants: {
      variant: {
        secondary: cn(
          'bg-secondary border-transparent',
          Platform.select({ web: '[a&]:hover:bg-secondary/90' }),
        ),
        outline: Platform.select({ web: '[a&]:hover:bg-accent [a&]:hover:text-accent-foreground' }),
      },
    },
    defaultVariants: {
      variant: 'outline',
    },
  },
);

const badgeTextVariants = cva('text-xs font-medium', {
  variants: {
    variant: {
      secondary: 'text-secondary-foreground',
      outline: 'text-foreground',
    },
  },
  defaultVariants: {
    variant: 'outline',
  },
});

type BadgeProps = React.ComponentProps<typeof View> &
  React.RefAttributes<View> &
  VariantProps<typeof badgeVariants>;

export function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <TextClassContext.Provider value={badgeTextVariants({ variant })}>
      <View className={cn(badgeVariants({ variant }), className)} {...props} />
    </TextClassContext.Provider>
  );
}
