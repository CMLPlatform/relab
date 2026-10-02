import type { PressableStateCallbackType } from 'react-native';

/**
 * The one press language for rows, cards, list items, inline links and bare
 * icon buttons (DESIGN.md, Press feedback): the One Tint (`bg-primary/12`) on
 * press and on web hover, a 120ms colour fade on web, never opacity dimming.
 * Filled controls are not covered here; they press to `primary-strong`.
 */
// NOTE: not gated on Platform.OS: native has no hover state and ignores the
// hover and transition utilities, and one string keeps every caller the same.
export const PRESS_TINT =
  'active:bg-primary/12 hover:bg-primary/12 transition-colors duration-120 motion-reduce:transition-none';

/**
 * The 120ms colour fade alone, for a Pressable whose fill comes from `pressFill()`
 * in a function `style`; Uniwind keeps both. Web only in effect.
 */
export const PRESS_FADE = 'transition-colors duration-120 motion-reduce:transition-none';

/** Pressable state; `hovered` is only ever true on web. */
export type PressState = Pick<PressableStateCallbackType, 'pressed'> & { hovered?: boolean };

/**
 * The fill a Pressable takes while pressed or hovered, as a style: `tokens.surface.accent`
 * (PRESS_TINT) for a row or card that keeps a function `style` or needs the tint laid over an
 * opaque child such as a photo; a filled control's pressed shade (`primary-strong`) otherwise.
 * Put it after the resting fill so it wins.
 */
export function pressFill({ pressed, hovered }: PressState, color: string) {
  return pressed || hovered ? { backgroundColor: color } : null;
}
