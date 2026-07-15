import { View } from 'react-native';
import { AppButton } from '@/components/base/AppButton';
import { AppDialog } from '@/components/base/AppDialog';
import { AppText } from '@/components/base/AppText';
import { CameraPickerDialog } from '@/components/cameras/CameraPickerDialog';
import { LivePreview } from '@/components/cameras/LivePreview';
import type { CameraReadWithStatus } from '@/services/api/rpiCamera';
import { useAppTheme } from '@/theme';
import { createGalleryStyles } from './styles';

type Props = {
  cameraPickerVisible: boolean;
  previewCamera: CameraReadWithStatus | null;
  isCapturing: boolean;
  onDismissCameraPicker: () => void;
  onSelectCamera: (camera: CameraReadWithStatus) => void;
  onDismissPreview: () => void;
  onCapturePreview: () => void;
};

export function ProductImageCameraDialogs({
  cameraPickerVisible,
  previewCamera,
  isCapturing,
  onDismissCameraPicker,
  onSelectCamera,
  onDismissPreview,
  onCapturePreview,
}: Props) {
  const theme = useAppTheme();
  const styles = createGalleryStyles(theme);
  return (
    <>
      <CameraPickerDialog
        visible={cameraPickerVisible}
        onDismiss={onDismissCameraPicker}
        onSelect={onSelectCamera}
      />

      <AppDialog visible={previewCamera !== null} onDismiss={onDismissPreview}>
        <AppText accessibilityRole="header" style={dialogStyles.title}>
          {previewCamera?.name ?? 'Camera preview'}
        </AppText>
        <View style={styles.previewDialogContent}>
          <LivePreview camera={previewCamera} enabled={previewCamera !== null} />
        </View>
        <View style={dialogStyles.actions}>
          <AppButton variant="ghost" onPress={onDismissPreview}>
            Cancel
          </AppButton>
          <AppButton
            variant="primary"
            disabled={isCapturing}
            loading={isCapturing}
            onPress={onCapturePreview}
          >
            Capture
          </AppButton>
        </View>
      </AppDialog>
    </>
  );
}

const dialogStyles = {
  title: { fontSize: 18, fontWeight: '600' as const, marginBottom: 8 },
  actions: {
    flexDirection: 'row' as const,
    justifyContent: 'flex-end' as const,
    gap: 4,
    marginTop: 16,
  },
};
