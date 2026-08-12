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
  // Web-only: BottomNav is viewport-fixed there and escapes the container the
  // fab is laid out in, so the fab needs the clearance bump itself. On native
  // BottomNav is in normal flow, so the container already shrinks — no bump.
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
