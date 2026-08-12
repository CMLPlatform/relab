import { Fab } from '@/components/base/Fab';
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
