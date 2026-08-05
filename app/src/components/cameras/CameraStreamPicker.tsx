import { type RefObject, useCallback } from 'react';
import type { View } from 'react-native';
import { useCameraStreamPicker } from '@/features/cameras/youtube/useCameraStreamPicker';
import { CameraPickerDialog } from './CameraPickerDialog';
import { GoLiveDialog } from './GoLiveDialog';

interface CameraStreamPickerProps {
  productId: number;
  productName: string;
  visible: boolean;
  onDismiss: () => void;
  triggerRef?: RefObject<View | null>;
}

export function CameraStreamPicker({
  productId,
  productName,
  visible,
  onDismiss,
  triggerRef,
}: CameraStreamPickerProps) {
  const { state, actions } = useCameraStreamPicker({
    productId,
    productName,
    onDismiss,
  });
  const { handleStartStream } = actions;
  const handleStart = useCallback(async () => handleStartStream(), [handleStartStream]);

  return (
    <>
      <CameraPickerDialog
        visible={visible && state.isSelectingCamera}
        onDismiss={actions.handleDismiss}
        onSelect={actions.handleCameraSelect}
        title="Select camera to stream"
        triggerRef={triggerRef}
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
        triggerRef={triggerRef}
      />
    </>
  );
}
