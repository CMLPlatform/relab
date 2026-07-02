import { CameraPickerDialog } from '@/components/cameras/CameraPickerDialog';
import { GoLiveDialog } from '@/components/cameras/GoLiveDialog';
import { useCameraStreamPicker } from '@/features/cameras/youtube/useCameraStreamPicker';

interface CameraStreamPickerProps {
  productId: number;
  productName: string;
  visible: boolean;
  onDismiss: () => void;
}

export function CameraStreamPicker({
  productId,
  productName,
  visible,
  onDismiss,
}: CameraStreamPickerProps) {
  const { state, actions } = useCameraStreamPicker({
    productId,
    productName,
    onDismiss,
  });
  const handleStart = async () => actions.handleStartStream();

  return (
    <>
      <CameraPickerDialog
        visible={visible && state.isSelectingCamera}
        onDismiss={actions.handleDismiss}
        onSelect={actions.handleCameraSelect}
        title="Select camera to stream"
      />
      <GoLiveDialog
        visible={state.config !== null}
        cameraName={state.config?.camera.name ?? ''}
        title={state.config?.title ?? ''}
        privacy={state.config?.privacy ?? 'private'}
        loading={state.isStarting}
        onDismiss={actions.handleBack}
        onChangeTitle={actions.setTitle}
        onChangePrivacy={actions.setPrivacy}
        onStart={handleStart}
        secondaryLabel="Back"
        onSecondary={actions.handleBack}
        showSpacer
      />
    </>
  );
}
