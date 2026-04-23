import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, renderHook } from '@testing-library/react-native';
import { useCameraRouteModes } from '@/hooks/cameras/routeModes';
import {
  useCameraSelectionActions,
  useCameraSelectionController,
  useCameraStreamingController,
} from '@/hooks/cameras/stateControllers';

const mockUseLocalSearchParams = jest.fn();

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockUseLocalSearchParams(),
}));

describe('camera controllers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseLocalSearchParams.mockReturnValue({});
  });

  it('parses capture and stream route modes', () => {
    mockUseLocalSearchParams.mockReturnValue({ product: '42', stream: '99' });

    const { result } = renderHook(() => useCameraRouteModes());

    expect(result.current.captureAllProductId).toBe(42);
    expect(result.current.captureModeEnabled).toBe(true);
    expect(result.current.streamProductId).toBe(99);
    expect(result.current.streamModeEnabled).toBe(true);
  });

  it('manages stream dialog and snackbar state', () => {
    const { result } = renderHook(() => useCameraStreamingController());

    act(() => {
      result.current.openStreamDialog('camera-1', 'Bench Cam', 'Default Title');
      result.current.setStreamTitle('Custom Title');
      result.current.setStreamPrivacy('public');
      result.current.setSnackbarMessage('Camera offline');
    });

    expect(result.current.streamDialog).toEqual({
      cameraId: 'camera-1',
      cameraName: 'Bench Cam',
      title: 'Custom Title',
      privacy: 'public',
    });
    expect(result.current.snackbarMessage).toBe('Camera offline');

    act(() => {
      result.current.closeStreamDialog();
      result.current.dismissSnackbar();
    });

    expect(result.current.streamDialog.cameraId).toBeNull();
    expect(result.current.snackbarMessage).toBeNull();
  });

  it('manages selection state and select-all action', () => {
    const { result } = renderHook(() => useCameraSelectionController());

    act(() => {
      result.current.enterSelectionMode('camera-1');
      result.current.toggleSelected('camera-2');
    });

    expect(result.current.selectionMode).toBe(true);
    expect(result.current.selectedCount).toBe(2);

    act(() => {
      result.current.clearSelection();
    });

    expect(result.current.selectionMode).toBe(false);
    expect(result.current.selectedCount).toBe(0);

    const selectAll = jest.fn();
    const { result: actionResult } = renderHook(() =>
      useCameraSelectionActions({
        onlineCameraIds: ['camera-1', 'camera-2'],
        selectAll,
      }),
    );

    act(() => {
      actionResult.current.handleSelectAll();
    });

    expect(selectAll).toHaveBeenCalledWith(['camera-1', 'camera-2']);
  });
});
