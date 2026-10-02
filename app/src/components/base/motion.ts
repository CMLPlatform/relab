import { FadeIn, FadeOut, LinearTransition, ReduceMotion } from 'react-native-reanimated';

/** Entrances run 200ms and exits 150ms: exits are quicker than entrances (DESIGN.md, Motion). */
export const ENTER_MS = 200;
export const EXIT_MS = 150;

/**
 * Plain fades for a view appearing or leaving. For rows in a short, non-virtualized list,
 * put the list in a `<LayoutAnimationConfig skipEntering skipExiting>` so rows already
 * there on mount do not fade in, and leaving the screen does not play every row's exit.
 */
export const FADE_ENTER = FadeIn.duration(ENTER_MS).reduceMotion(ReduceMotion.System);
export const FADE_EXIT = FadeOut.duration(EXIT_MS).reduceMotion(ReduceMotion.System);
/** Neighbours slide into the space a row leaves or makes, instead of jumping. */
export const ROW_MOVE = LinearTransition.duration(ENTER_MS).reduceMotion(ReduceMotion.System);
