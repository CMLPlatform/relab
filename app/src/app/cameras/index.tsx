import { useCallback } from 'react';
import { CenteredSpinner } from '@/components/base/CenteredSpinner';
import { ErrorState } from '@/components/base/ErrorState';
import { PageContainer } from '@/components/base/PageContainer';
import { GoLiveDialog } from '@/components/cameras/GoLiveDialog';
import { SelectionBar } from '@/components/cameras/SelectionBar';
import { CamerasFab, CamerasSnackbar } from '@/components/cameras/screen/Chrome';
import { CamerasGrid } from '@/components/cameras/screen/Grid';
import { useCamerasScreen } from '@/features/cameras/useCamerasScreen';

export default function CamerasScreen() {
  const { screen, selection, streaming, actions } = useCamerasScreen();
  const { refetch } = screen;
  const handleStartStream = async () => streaming.handleStartStream();
  const handleRetry = useCallback(() => refetch(), [refetch]);

  if (!screen.user) return null;
  if (screen.isLoading) return <CenteredSpinner />;
  if (screen.isError) {
    return (
      <ErrorState
        message={String(screen.error) || 'Failed to load cameras.'}
        onRetry={handleRetry}
      />
    );
  }

  return (
    <>
      <PageContainer phoneFullBleed>
        <SelectionBar
          visible={selection.selectionMode}
          selectedCount={selection.selectedCount}
          onlineCount={screen.onlineCount}
          onSelectAll={selection.handleSelectAll}
          onClear={selection.clearSelection}
          onCaptureAll={selection.handleCaptureSelected}
          isCapturing={selection.captureAllPending}
        />

        <CamerasGrid
          rows={screen.rows}
          numColumns={screen.numColumns}
          selectedIds={selection.selectedIds}
          isFetching={screen.isFetching}
          onRefresh={handleRetry}
          onCardPress={actions.handleCardTap}
          onCardLongPress={actions.handleCardLongPress}
          onEffectiveConnectionChange={actions.handleEffectiveConnectionChange}
        />
      </PageContainer>

      <CamerasFab visible={!screen.streamModeEnabled} onPress={actions.openAddCamera} />

      <CamerasSnackbar message={streaming.snackbarMessage} onDismiss={streaming.dismissSnackbar} />

      <GoLiveDialog
        visible={streaming.streamDialog.cameraId !== null}
        cameraName={streaming.streamDialog.cameraName}
        title={streaming.streamDialog.title}
        privacy={streaming.streamDialog.privacy}
        loading={streaming.isStartingStream}
        onDismiss={streaming.closeStreamDialog}
        onChangeTitle={streaming.setStreamTitle}
        onChangePrivacy={streaming.setStreamPrivacy}
        onStart={handleStartStream}
        secondaryLabel="Cancel"
        onSecondary={streaming.closeStreamDialog}
      />
    </>
  );
}
