import { Platform } from 'react-native';
import { Fab } from '@/components/base/Fab';
import { BOTTOM_NAV_CLEARANCE, useBottomNavVisible } from '@/components/base/useBottomNav';
import { useAppTheme } from '@/theme';
import { createCameraScreenStyles } from './styles';

type CamerasFabProps = {
  visible: boolean;
  onPress: () => void;
};

export function CamerasFab({ visible, onPress }: CamerasFabProps) {
  const theme = useAppTheme();
  const styles = createCameraScreenStyles(theme);
  const bottomNavVisible = useBottomNavVisible();
  // Web-only: position:fixed sits against the viewport and overlaps the tab
  // bar; on native the scene is already shrunk by the bar.
  const bottomOffset = Platform.OS === 'web' && bottomNavVisible ? BOTTOM_NAV_CLEARANCE : 0;
  if (!visible) return null;

  return (
    <Fab
      icon="plus"
      label="Add camera"
      extended
      onPress={onPress}
      style={[styles.fab, { bottom: 16 + bottomOffset }]}
      accessibilityLabel="Add camera"
    />
  );
}
