import { useEffect } from 'react';
import { Fab } from '@/components/base/Fab';
import { useAppFeedback } from '@/hooks/useAppFeedback';
import { useAppTheme } from '@/theme';
import { createCameraScreenStyles } from './styles';

type CamerasFabProps = {
  visible: boolean;
  onPress: () => void;
};

export function CamerasFab({ visible, onPress }: CamerasFabProps) {
  const theme = useAppTheme();
  const styles = createCameraScreenStyles(theme);
  if (!visible) return null;

  return (
    <Fab
      icon="plus"
      label="Add camera"
      extended
      onPress={onPress}
      style={styles.fab}
      accessibilityLabel="Add camera"
    />
  );
}

type CamerasSnackbarProps = {
  message: string | null;
  onDismiss: () => void;
};

/**
 * Forwards a one-shot feedback message to the app's toast (which owns its
 * own auto-dismiss timing) and immediately clears the caller's message
 * state, replacing react-native-paper's Snackbar.
 */
export function CamerasSnackbar({ message, onDismiss }: CamerasSnackbarProps) {
  const feedback = useAppFeedback();

  useEffect(() => {
    if (message === null) return;
    feedback.toast(message);
    onDismiss();
  }, [message, onDismiss, feedback]);

  return null;
}
