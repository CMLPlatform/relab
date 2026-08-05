import type { ReactNode, RefObject } from 'react';
import { Modal, Pressable, StyleSheet, type View } from 'react-native';
import { spacing } from '@/constants';
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

/**
 * Shared chrome for the app's Paper-free dialogs: a centered surface over a
 * scrim, built on React Native's core Modal — which brings its own focus trap
 * and Escape→onRequestClose on web (see DialogProvider.tsx for the rationale
 * behind not using the vendored rn-primitives ui/dialog here).
 *
 * NOTE (2026-08-05): re-confirmed during the ui/ kit adoption pass — this stays on
 * RN-core Modal; `ui/dialog` would replace a working focus trap with a portal one.
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
        style={[styles.overlay, { backgroundColor: theme.tokens.overlay.scrim }]}
        onPress={handleDismiss}
      >
        {/* Swallow presses so tapping inside the dialog doesn't dismiss it. */}
        <Pressable onPress={(e) => e.stopPropagation()} style={styles.dialogWrapper}>
          <OverlaySurface style={[styles.dialog, theme.tokens.elevation.overlay]} tone="surface">
            {children}
          </OverlaySurface>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.md,
  },
  dialogWrapper: {
    width: '100%',
    maxWidth: 480,
    maxHeight: '85%',
  },
  dialog: {
    padding: spacing.md,
  },
});
