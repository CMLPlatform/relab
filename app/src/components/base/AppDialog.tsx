import type { ReactNode, RefObject } from 'react';
import { Modal, Pressable, StyleSheet, type View } from 'react-native';
import Animated, { Easing, FadeInUp, ReduceMotion } from 'react-native-reanimated';
import { useReturnFocus } from '@/hooks/useReturnFocus';
import { useAppTheme } from '@/theme';
import { OverlaySurface } from './OverlaySurface';

type AppDialogProps = {
  visible: boolean;
  onDismiss: () => void;
  /** When false, tapping the backdrop or pressing Escape/back does not dismiss. Defaults to true. */
  dismissable?: boolean;
  /** The element that opened this dialog, so native screen readers can return focus to it on close. */
  triggerRef?: RefObject<View | null>;
  children: ReactNode;
};

const NOOP = () => {};

// Swallow presses so tapping inside the dialog doesn't dismiss it. Module-level so it's
// a stable reference across renders (this rule turns on for tap targets in this repo).
function stopPropagation(e: { stopPropagation: () => void }) {
  e.stopPropagation();
}

/**
 * Shared chrome for the app's Paper-free dialogs: a centered surface over a
 * scrim, built on React Native's core Modal — which brings its own focus trap
 * and Escape→onRequestClose on web (see DialogProvider.tsx for the rationale
 * behind not using the vendored rn-primitives ui/dialog here).
 *
 * NOTE: hand-rolled on purpose — uses RN-core Modal for native focus trap and Escape→onRequestClose.
 */
export function AppDialog({
  visible,
  onDismiss,
  dismissable = true,
  triggerRef,
  children,
}: AppDialogProps) {
  const theme = useAppTheme();
  const handleDismiss = dismissable ? onDismiss : undefined;
  // Every dialog inherits return-focus on close; triggerRef is optional and
  // only needed for native screen-reader focus restore (web works without it).
  useReturnFocus(visible, triggerRef);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleDismiss ?? NOOP}
    >
      <Pressable
        className="flex-1 items-center justify-center p-4"
        style={{ backgroundColor: theme.tokens.overlay.scrim }}
        onPress={handleDismiss}
      >
        <Pressable onPress={stopPropagation} className="w-full" style={styles.dialogWrapper}>
          <Animated.View
            entering={FadeInUp.duration(200)
              .easing(Easing.out(Easing.quad))
              .reduceMotion(ReduceMotion.System)}
          >
            <OverlaySurface className="p-4" style={theme.tokens.elevation.overlay} tone="surface">
              {children}
            </OverlaySurface>
          </Animated.View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  dialogWrapper: {
    maxWidth: 480,
    maxHeight: '85%',
  },
});
