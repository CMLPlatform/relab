import * as ToggleGroupPrimitive from '@rn-primitives/toggle-group';
import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';
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

const ToggleGroupContext = React.createContext<VariantProps<typeof toggleVariants> | null>(null);

function ToggleGroup({
  className,
  variant,
  size,
  children,
  ...props
}: React.ComponentProps<typeof ToggleGroupPrimitive.Root> & VariantProps<typeof toggleVariants>) {
  return (
    <ToggleGroupPrimitive.Root
      className={cn(
        'flex flex-row items-center rounded-md shadow-none',
        Platform.select({ web: 'w-fit' }),
        className,
      )}
      {...props}
    >
      <ToggleGroupContext.Provider value={{ variant, size }}>
        {children}
      </ToggleGroupContext.Provider>
    </ToggleGroupPrimitive.Root>
  );
}

function useToggleGroupContext() {
  const context = React.useContext(ToggleGroupContext);
  if (context === null) {
    throw new Error(
      'ToggleGroup compound components cannot be rendered outside the ToggleGroup component',
    );
  }
  return context;
}

function ToggleGroupItem({
  className,
  children,
  variant,
  size,
  isFirst,
  isLast,
  ...props
}: React.ComponentProps<typeof ToggleGroupPrimitive.Item> &
  VariantProps<typeof toggleVariants> & {
    isFirst?: boolean;
    isLast?: boolean;
  }) {
  const context = useToggleGroupContext();
  const { value } = ToggleGroupPrimitive.useRootContext();

  return (
    <TextClassContext.Provider
      value={cn(
        'text-sm text-foreground font-medium',
        ToggleGroupPrimitive.utils.getIsSelected(value, props.value)
          ? 'text-primary'
          : Platform.select({ web: 'group-hover:text-muted-foreground' }),
      )}
    >
      <ToggleGroupPrimitive.Item
        className={cn(
          toggleVariants({
            variant: context.variant || variant,
            size: context.size || size,
          }),
          props.disabled && 'opacity-50',
          ToggleGroupPrimitive.utils.getIsSelected(value, props.value) && 'bg-primary/12',
          'min-w-0 shrink-0 rounded-none shadow-none',
          isFirst && 'rounded-l-md',
          isLast && 'rounded-r-md',
          (context.variant === 'outline' || variant === 'outline') && 'border-l-0',
          (context.variant === 'outline' || variant === 'outline') && isFirst && 'border-l',
          Platform.select({
            web: 'flex-1 focus:z-10 focus-visible:z-10',
          }),
          className,
        )}
        {...props}
      >
        {children}
      </ToggleGroupPrimitive.Item>
    </TextClassContext.Provider>
  );
}

export { ToggleGroup, ToggleGroupItem };
