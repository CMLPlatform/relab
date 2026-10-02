import { View } from 'react-native';
import { PRESS_FADE, type PressState, pressFill } from '@/components/base/pressFeedback';
import { cn } from '@/utils/cn';

/**
 * The One Tint laid over an opaque fill (a photo, a card, a sunken or inverse ground)
 * instead of replacing it. Put it last inside the pressed element; `className` adds the
 * element's radius, `color` swaps the tint for another ink at 12%.
 */
export function PressOverlay({
  className,
  color,
  testID,
  ...state
}: PressState & { className?: string; color?: string; testID?: string }) {
  return (
    <View
      aria-hidden
      pointerEvents="none"
      testID={testID}
      className={cn(
        'absolute inset-0',
        state.pressed || state.hovered ? 'bg-primary/12' : 'bg-transparent',
        PRESS_FADE,
        className,
      )}
      // Inline style beats the class, so `color` wins over `bg-primary/12`.
      style={color ? pressFill(state, color) : undefined}
    />
  );
}
