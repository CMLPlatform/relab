import { CenteredSpinner } from '@/components/base/CenteredSpinner';
import { ErrorState } from '@/components/base/ErrorState';
import {
  CamerasFab,
  CamerasSelectionOverlay,
  CamerasSnackbar,
  CamerasStreamDialog,
} from '@/components/cameras/screen/Chrome';
import { CamerasGrid } from '@/components/cameras/screen/Grid';
import { useCamerasScreen } from '@/features/cameras/useCamerasScreen';

export default function CamerasScreen() {
  const { screen, selection, streaming, actions } = useCamerasScreen();
  const handleStartStream = async () => streaming.handleStartStream();

  if (!screen.user) return null;
  if (screen.isLoading) return <CenteredSpinner />;
  if (screen.isError) {
    return (
      <ErrorState
        message={String(screen.error) || 'Failed to load cameras.'}
        onRetry={() => screen.refetch()}
      />
    );
  }

  return (
    <>
      <CamerasSelectionOverlay
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
        onRefresh={() => screen.refetch()}
        onCardPress={actions.handleCardTap}
        onCardLongPress={actions.handleCardLongPress}
        onEffectiveConnectionChange={actions.handleEffectiveConnectionChange}
      />

      <CamerasFab visible={!screen.streamModeEnabled} onPress={actions.openAddCamera} />

      <CamerasSnackbar message={streaming.snackbarMessage} onDismiss={streaming.dismissSnackbar} />

      <CamerasStreamDialog
        state={streaming.streamDialog}
        loading={streaming.isStartingStream}
        onDismiss={streaming.closeStreamDialog}
        onChangeTitle={streaming.setStreamTitle}
        onChangePrivacy={streaming.setStreamPrivacy}
        onStart={handleStartStream}
      />
    </>
  );
}
