import type { RefObject } from 'react';
import { View } from 'react-native';
import { AppButton } from '@/components/base/AppButton';
import { AppDialog } from '@/components/base/AppDialog';
import { AppText } from '@/components/base/AppText';
import { dialogActionsStyle, dialogTitleStyle } from '@/components/base/dialogStyles';
import { CameraPickerDialog } from '@/components/cameras/CameraPickerDialog';
import { LivePreview } from '@/components/cameras/LivePreview';
import type { CameraReadWithStatus } from '@/services/api/rpiCamera';

type Props = {
  cameraPickerVisible: boolean;
  previewCamera: CameraReadWithStatus | null;
  isCapturing: boolean;
  onDismissCameraPicker: () => void;
  onSelectCamera: (camera: CameraReadWithStatus) => void;
  onDismissPreview: () => void;
  onCapturePreview: () => void;
  /** The RPi-capture button that starts this flow; both dialogs below share it. */
  triggerRef?: RefObject<View | null>;
};

export function ProductImageCameraDialogs({
  cameraPickerVisible,
  previewCamera,
  isCapturing,
  onDismissCameraPicker,
  onSelectCamera,
  onDismissPreview,
  onCapturePreview,
  triggerRef,
}: Props) {
  return (
    <>
      <CameraPickerDialog
        visible={cameraPickerVisible}
        onDismiss={onDismissCameraPicker}
        onSelect={onSelectCamera}
        triggerRef={triggerRef}
      />

      <AppDialog
        visible={previewCamera !== null}
        onDismiss={onDismissPreview}
        triggerRef={triggerRef}
      >
        <AppText variant="title" accessibilityRole="header" style={dialogTitleStyle}>
          {previewCamera?.name ?? 'Camera preview'}
        </AppText>
        <View className="items-center gap-3">
          <LivePreview camera={previewCamera} enabled={previewCamera !== null} />
        </View>
        <View style={dialogActionsStyle}>
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
