import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, renderHook } from '@testing-library/react-native';
import { useCameraRouteModes } from '@/features/cameras/routeModes';
import {
  useCameraSelectionController,
  useCameraStreamingController,
} from '@/features/cameras/state';

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

    act(() => {
      result.current.selectAll(['camera-1', 'camera-2']);
    });

    expect(result.current.selectedCount).toBe(2);
  });

  it('prunes selected ids for cameras that leave the list', () => {
    const { result } = renderHook(() => useCameraSelectionController());

    act(() => {
      result.current.enterSelectionMode('camera-1');
      result.current.toggleSelected('camera-2');
    });
    expect(result.current.selectedCount).toBe(2);

    // camera-2 disappears from the live list (e.g. unpaired on refetch).
    act(() => {
      result.current.retainSelected(new Set(['camera-1']));
    });
    expect(result.current.selectedCount).toBe(1);
    expect(result.current.selectedIds.has('camera-2')).toBe(false);

    // No-op when every selected id is still present (keeps the same Set reference).
    const before = result.current.selectedIds;
    act(() => {
      result.current.retainSelected(new Set(['camera-1', 'camera-9']));
    });
    expect(result.current.selectedIds).toBe(before);
  });
});
