import { FadeIn, FadeOut, LinearTransition, ReduceMotion } from 'react-native-reanimated';

/**
 * Layout animations for rows in a short, non-virtualized list. Put the list in a
 * `<LayoutAnimationConfig skipEntering skipExiting>` so rows already there on
 * mount do not fade in, and leaving the screen does not play every row's exit.
 */
export const ROW_ENTER = FadeIn.duration(200).reduceMotion(ReduceMotion.System);
export const ROW_EXIT = FadeOut.duration(150).reduceMotion(ReduceMotion.System);
/** Neighbours slide into the space a row leaves or makes, instead of jumping. */
export const ROW_MOVE = LinearTransition.duration(200).reduceMotion(ReduceMotion.System);
