import type { ReactNode } from 'react';
import { Modal, Pressable, StyleSheet } from 'react-native';
import { spacing } from '@/constants';
import { useAppTheme } from '@/theme';
import { OverlaySurface } from './OverlaySurface';

type AppDialogProps = {
  visible: boolean;
  onDismiss: () => void;
  /** When false, tapping the backdrop or pressing Escape/back does not dismiss. Defaults to true. */
  dismissable?: boolean;
  children: ReactNode;
};

const NOOP = () => {};

/**
 * Shared chrome for the app's Paper-free dialogs: a centered surface over a
 * scrim, built on React Native's core Modal — which brings its own focus trap
 * and Escape→onRequestClose on web (see DialogProvider.tsx for the rationale
 * behind not using the vendored rn-primitives ui/dialog here).
 */
export function AppDialog({ visible, onDismiss, dismissable = true, children }: AppDialogProps) {
  const theme = useAppTheme();
  const handleDismiss = dismissable ? onDismiss : undefined;

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
          <OverlaySurface style={[styles.dialog, theme.tokens.elevation.overlay]} tone="scrim">
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
