import { describe, expect, it, jest } from '@jest/globals';
import { act, renderHook } from '@testing-library/react-native';
import {
  useCameraCaptureActions,
  useCameraConnectionSnapshots,
} from '@/features/cameras/rpi/captureActions';

describe('camera capture action hooks', () => {
  it('stores effective connection snapshots without rewriting identical values', () => {
    const { result } = renderHook(() => useCameraConnectionSnapshots());
    const localConnection = {
      mode: 'local' as const,
      localBaseUrl: 'http://cam.local',
      localApiKey: 'key',
    };

    act(() => {
      result.current.handleEffectiveConnectionChange('cam-1', {
        isReachable: true,
        transport: 'direct',
        localConnection,
      });
      result.current.handleEffectiveConnectionChange('cam-1', {
        isReachable: true,
        transport: 'direct',
        localConnection,
      });
    });

    expect(result.current.effectiveConnectionByCameraId).toEqual({
      'cam-1': { isReachable: true, transport: 'direct', localConnection },
    });
    expect(result.current.connectionInfoByCameraId).toEqual({ 'cam-1': localConnection });
  });

  it('handles capture selection, offline warnings, and success messaging', () => {
    const mutate = jest.fn((...args: unknown[]) => {
      const options = args[1] as {
        onSuccess: (result: { total: number; succeeded: number; failed: number }) => void;
      };
      options.onSuccess({ total: 2, succeeded: 1, failed: 1 });
    });
    const setSnackbar = jest.fn();
    const clearSelection = jest.fn();
    const enterSelectionMode = jest.fn();
    const toggleSelected = jest.fn();
    const selectedIds = new Set(['cam-1', 'cam-2']);

    const { result } = renderHook(() =>
      useCameraCaptureActions({
        captureAll: { mutate },
        captureAllProductId: 42,
        clearSelection,
        selectedIds,
        captureModeEnabled: true,
        selectionMode: false,
        enterSelectionMode,
        toggleSelected,
        isCameraReachable: (camera) => camera.id !== 'cam-offline',
        setSnackbar,
      }),
    );

    act(() => {
      result.current.handleCardLongPress({ id: 'cam-offline', name: 'Offline Cam' } as never);
      result.current.handleCardLongPress({ id: 'cam-1', name: 'Cam 1' } as never);
      result.current.handleCaptureSelected();
    });

    expect(setSnackbar).toHaveBeenCalledWith("Offline Cam is offline — can't capture.");
    expect(enterSelectionMode).toHaveBeenCalledWith('cam-1');
    expect(mutate).toHaveBeenCalledWith(
      { cameraIds: ['cam-1', 'cam-2'], productId: 42 },
      expect.any(Object),
    );
    expect(setSnackbar).toHaveBeenCalledWith('Captured 1/2 · 1 failed');
    expect(clearSelection).toHaveBeenCalled();
  });
});
