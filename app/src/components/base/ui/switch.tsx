import * as SwitchPrimitives from '@rn-primitives/switch';
import { Platform } from 'react-native';
import { WEB_FOCUS_RING } from '@/constants';
import { cn } from '@/utils/cn';

function Switch({ className, ...props }: React.ComponentProps<typeof SwitchPrimitives.Root>) {
  return (
    <SwitchPrimitives.Root
      // The 18x32 track is the whole control, so the 44px target comes from
      // hitSlop rather than a bigger switch. React Native Web ignores hitSlop;
      // there the surrounding row is the label hit-area.
      hitSlop={{ top: 13, bottom: 13, left: 6, right: 6 }}
      className={cn(
        'flex h-[1.15rem] w-8 shrink-0 flex-row items-center rounded-full border border-transparent',
        Platform.select({
          web: cn(
            'peer inline-flex outline-none transition-colors disabled:cursor-not-allowed',
            WEB_FOCUS_RING,
          ),
        }),
        props.checked ? 'bg-primary' : 'bg-input dark:bg-input/80',
        props.disabled && 'opacity-50',
        className,
      )}
      {...props}
    >
      <SwitchPrimitives.Thumb
        className={cn(
          'bg-background size-4 rounded-full transition-transform',
          Platform.select({
            web: 'pointer-events-none block ring-0',
          }),
          props.checked
            ? 'dark:bg-primary-foreground translate-x-3.5'
            : 'dark:bg-foreground translate-x-0',
        )}
      />
    </SwitchPrimitives.Root>
  );
}

export { Switch };
