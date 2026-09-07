import { Platform, TextInput } from 'react-native';
import { WEB_FOCUS_RING } from '@/constants';
import { cn } from '@/utils/cn';

function Input({
  className,
  ...props
}: React.ComponentProps<typeof TextInput> & React.RefAttributes<TextInput>) {
  return (
    <TextInput
      className={cn(
        'dark:bg-input/30 border-input bg-background text-foreground flex min-h-11 w-full min-w-0 flex-row items-center rounded-md border px-3 py-1 text-base leading-5 sm:h-9',
        props.editable === false &&
          cn(
            'opacity-50',
            Platform.select({ web: 'disabled:pointer-events-none disabled:cursor-not-allowed' }),
          ),
        Platform.select({
          web: cn(
            'placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground outline-none transition-[color,box-shadow] md:text-sm',
            // A ring utility paints nothing here (see WEB_FOCUS_RING). Do not
            // name the old class in a comment: Tailwind scans comment text.
            WEB_FOCUS_RING,
            'focus-visible:border-ring',
            'aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive',
          ),
          native: 'placeholder:text-muted-foreground/50',
        }),
        className,
      )}
      {...props}
    />
  );
}

export { Input };
