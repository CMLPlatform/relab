import { useEffect, useState } from 'react';
import {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  type WithTimingConfig,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

export type PresenceTiming = { open: WithTimingConfig; close: WithTimingConfig };

/** Overlays fade in over 200ms and out over 150ms: exits are quicker than entrances. */
const OVERLAY_TIMING: PresenceTiming = {
  open: { duration: 200, easing: Easing.out(Easing.quad), reduceMotion: ReduceMotion.System },
  close: { duration: 150, easing: Easing.in(Easing.quad), reduceMotion: ReduceMotion.System },
};

/**
 * Keeps an RN Modal mounted through its own exit, in place of `animationType`
 * (react-native-web's fade runs 300ms each way, so a close was as slow as an open).
 * Render `<Modal visible={mounted} animationType="none">` with its content in an
 * Animated.View styled by `fadeStyle`; `progress` (0 closed, 1 open) drives any
 * further styles. While closing, keep the content from taking presses
 * (`pointerEvents` off `visible`), so a second tap cannot repeat an action. Pass
 * `mounted`, not `visible`, to useReturnFocus: the Modal's focus trap holds focus
 * until it really closes.
 */
export function useModalPresence(visible: boolean, timing: PresenceTiming = OVERLAY_TIMING) {
  const [mounted, setMounted] = useState(visible);
  if (visible && !mounted) setMounted(true);
  const progress = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      progress.value = withTiming(1, timing.open);
      return;
    }
    // Reopening mid-close retargets the tween, which ends this one unfinished.
    progress.value = withTiming(0, timing.close, (finished) => {
      if (finished) scheduleOnRN(setMounted, false);
    });
  }, [progress, timing, visible]);

  const fadeStyle = useAnimatedStyle(() => ({ opacity: progress.value }));
  return { mounted, progress, fadeStyle };
}
