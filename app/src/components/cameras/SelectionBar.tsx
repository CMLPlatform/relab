import { View } from 'react-native';
import { AppButton } from '@/components/base/AppButton';
import { AppText } from '@/components/base/AppText';
import { Icon } from '@/components/base/Icon';
import { IconButton } from '@/components/base/IconButton';
import { useAppTheme } from '@/theme';

/**
 * Sticky top bar shown while the mosaic is in multi-select mode.
 *
 * Users arrive here by long-pressing a card (native) or tapping a dedicated
 * "Select" button (web). The bar lets them fire the Capture N action across
 * the selected cameras, select all online cameras at once, or clear the
 * selection and return to normal navigation mode.
 */
export function SelectionBar({
  visible,
  selectedCount,
  onlineCount,
  onSelectAll,
  onClear,
  onCaptureAll,
  isCapturing,
}: {
  visible: boolean;
  selectedCount: number;
  onlineCount: number;
  onSelectAll: () => void;
  onClear: () => void;
  onCaptureAll: () => void;
  isCapturing: boolean;
}) {
  const theme = useAppTheme();
  const canCapture = selectedCount > 0 && !isCapturing;
  if (!visible) return null;
  return (
    <View
      className="flex-row items-center gap-2 px-3 py-2"
      style={{ backgroundColor: theme.tokens.surface.accent }}
    >
      <IconButton icon="close" onPress={onClear} accessibilityLabel="Clear selection" />
      <AppText variant="title" className="ml-1">
        {selectedCount} selected
      </AppText>
      <View className="flex-1" />
      <AppButton
        variant="ghost"
        onPress={onSelectAll}
        disabled={onlineCount === 0 || selectedCount === onlineCount}
        accessibilityLabel="Select all online cameras"
      >
        Select all ({onlineCount})
      </AppButton>
      <AppButton
        variant="primary"
        onPress={onCaptureAll}
        loading={isCapturing}
        disabled={!canCapture}
      >
        <Icon name="camera-burst" size={16} color={theme.colors.onPrimary} />
        <AppText style={{ color: theme.colors.onPrimary }}>
          {isCapturing ? 'Capturing…' : `Capture ${selectedCount}`}
        </AppText>
      </AppButton>
    </View>
  );
}
