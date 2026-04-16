import {
  CameraConnectionCard,
  CameraDangerZone,
  CameraDetailDialogs,
  CameraDetailErrorState,
  CameraDetailLayout,
  CameraDetailLoadingState,
  CameraDetailsCard,
  CameraPreviewSection,
  CameraStreamingSection,
} from '@/components/cameras/CameraDetailSections';
import { useCameraDetailScreen } from '@/hooks/cameras/useCameraDetailScreen';

export default function CameraDetailScreen() {
  const { screen, preview, dialogs, actions } = useCameraDetailScreen();

  if (!screen.user) return null;
  if (screen.isLoading) return <CameraDetailLoadingState />;

  if (screen.isError || !screen.camera) {
    return (
      <CameraDetailErrorState
        message={String(screen.error) || 'Camera not found.'}
        onRetry={actions.refresh}
      />
    );
  }

  return (
    <>
      <CameraDetailLayout>
        <CameraConnectionCard
          camera={screen.camera}
          effectiveConnection={screen.effectiveConnection}
          isFetching={screen.isFetching}
          onRefresh={actions.refresh}
          onOpenManualSetup={actions.openManualSetup}
          onDisconnectLocal={actions.disconnectLocal}
        />

        <CameraPreviewSection
          camera={screen.camera}
          canPreview={screen.canPreview}
          previewEnabled={preview.enabled}
          onTogglePreview={actions.togglePreview}
          connectionInfo={screen.localConnection}
        />

        <CameraStreamingSection cameraId={screen.camera.id} isOnline={screen.isOnline} />

        <CameraDetailsCard
          camera={screen.camera}
          onEditName={actions.openEditName}
          onEditDescription={actions.openEditDescription}
        />

        <CameraDangerZone onDelete={actions.requestDelete} />
      </CameraDetailLayout>

      <CameraDetailDialogs
        camera={screen.camera}
        editNameVisible={dialogs.editNameVisible}
        editDescriptionVisible={dialogs.editDescriptionVisible}
        deleteVisible={dialogs.deleteVisible}
        localSetupVisible={dialogs.localSetupVisible}
        localUrlInput={dialogs.localUrlInput}
        localKeyInput={dialogs.localKeyInput}
        updateLoading={dialogs.updateLoading}
        deleteLoading={dialogs.deleteLoading}
        localSetupSaving={dialogs.localSetupSaving}
        onDismissEditName={actions.closeEditName}
        onDismissEditDescription={actions.closeEditDescription}
        onDismissDelete={actions.closeDelete}
        onDismissLocalSetup={actions.closeManualSetup}
        onSaveName={actions.saveName}
        onSaveDescription={actions.saveDescription}
        onDeleteCamera={actions.deleteCamera}
        onChangeLocalUrl={actions.setLocalUrl}
        onChangeLocalKey={actions.setLocalKey}
        onConnectLocal={() => {
          void actions.connectLocal();
        }}
      />
    </>
  );
}
