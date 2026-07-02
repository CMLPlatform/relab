import { AnimatedFAB, Snackbar } from 'react-native-paper';
import { createCameraScreenStyles } from '@/components/cameras/screen/styles';
import { useAppTheme } from '@/theme';

type CamerasFabProps = {
  visible: boolean;
  onPress: () => void;
};

export function CamerasFab({ visible, onPress }: CamerasFabProps) {
  const theme = useAppTheme();
  const styles = createCameraScreenStyles(theme);
  if (!visible) return null;

  return (
    <AnimatedFAB
      icon="plus"
      label="Add Camera"
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

export function CamerasSnackbar({ message, onDismiss }: CamerasSnackbarProps) {
  return (
    <Snackbar visible={message !== null} onDismiss={onDismiss} duration={4000}>
      {message ?? ''}
    </Snackbar>
  );
}
