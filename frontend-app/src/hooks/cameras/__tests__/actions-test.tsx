import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, renderHook } from '@testing-library/react-native';
import {
  useCameraCaptureActions,
  useCameraConnectionSnapshots,
  useCameraStreamActions,
} from '@/hooks/cameras/actions';

const mockPush = jest.fn();
const mockBack = jest.fn();
const mockSetActiveStream = jest.fn();
const mockInvalidateQueries = jest.fn();
const mockAddProductVideo = jest.fn();
const mockStartYouTubeStream = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    back: mockBack,
  }),
}));

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    invalidateQueries: mockInvalidateQueries,
  }),
}));

jest.mock('@/context/StreamSessionContext', () => ({
  useStreamSession: () => ({
    setActiveStream: mockSetActiveStream,
  }),
}));

jest.mock('@/services/api/products', () => ({
  addProductVideo: (...args: unknown[]) => mockAddProductVideo(...args),
}));

jest.mock('@/services/api/rpiCamera', () => ({
  startYouTubeStream: (...args: unknown[]) => mockStartYouTubeStream(...args),
}));

describe('camera action hooks', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAddProductVideo.mockImplementation(async () => undefined);
    mockStartYouTubeStream.mockImplementation(async () => ({
      started_at: '2026-01-01T00:00:00.000Z',
      url: 'https://youtube.test/watch?v=abc',
    }));
  });

  it('stores effective connection snapshots without rewriting identical values', () => {
    const { result } = renderHook(() => useCameraConnectionSnapshots());

    act(() => {
      result.current.handleEffectiveConnectionChange('cam-1', {
        isReachable: true,
        transport: 'direct',
      });
      result.current.handleEffectiveConnectionChange('cam-1', {
        isReachable: true,
        transport: 'direct',
      });
    });

    expect(result.current.effectiveConnectionByCameraId).toEqual({
      'cam-1': { isReachable: true, transport: 'direct' },
    });
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

  it('routes stream-mode taps, detail navigation, and offline warnings correctly', () => {
    const openStreamDialog = jest.fn();
    const toggleSelected = jest.fn();
    const setSnackbar = jest.fn();
    const feedback = { alert: jest.fn(), error: jest.fn() };

    const { result, rerender } = renderHook(
      ({
        streamModeEnabled,
        selectionMode,
      }: {
        streamModeEnabled: boolean;
        selectionMode: boolean;
      }) =>
        useCameraStreamActions({
          streamModeEnabled,
          selectionMode,
          isCameraReachable: (camera) => camera.id !== 'cam-offline',
          openStreamDialog,
          streamProductName: 'Desk Radio',
          toggleSelected,
          setSnackbar,
          streamDialog: {
            cameraId: 'cam-1',
            cameraName: 'Camera 1',
            title: 'Desk Radio',
            privacy: 'private',
          },
          streamProductId: 42,
          streamProductNameForSession: 'Desk Radio',
          closeStreamDialog: jest.fn(),
          setIsStartingStream: jest.fn(),
          feedback,
        }),
      { initialProps: { streamModeEnabled: true, selectionMode: false } },
    );

    act(() => {
      result.current.handleCardTap({ id: 'cam-offline', name: 'Offline Cam' } as never);
      result.current.handleCardTap({ id: 'cam-1', name: 'Camera 1' } as never);
    });

    expect(setSnackbar).toHaveBeenCalledWith("Offline Cam is offline — can't stream.");
    expect(openStreamDialog).toHaveBeenCalledWith('cam-1', 'Camera 1', 'Desk Radio');

    rerender({ streamModeEnabled: false, selectionMode: false });

    act(() => {
      result.current.handleCardTap({ id: 'cam-2', name: 'Camera 2' } as never);
    });

    expect(mockPush).toHaveBeenCalledWith({ pathname: '/cameras/[id]', params: { id: 'cam-2' } });
  });

  it('starts a stream successfully and handles start failures', async () => {
    const closeStreamDialog = jest.fn();
    const setIsStartingStream = jest.fn();
    const setSnackbar = jest.fn();
    const feedback = { alert: jest.fn(), error: jest.fn() };

    const { result } = renderHook(() =>
      useCameraStreamActions({
        streamModeEnabled: true,
        selectionMode: false,
        isCameraReachable: () => true,
        openStreamDialog: jest.fn(),
        streamProductName: 'Desk Radio',
        toggleSelected: jest.fn(),
        setSnackbar,
        streamDialog: {
          cameraId: 'cam-1',
          cameraName: 'Camera 1',
          title: ' Desk Radio Live ',
          privacy: 'unlisted',
        },
        streamProductId: 42,
        streamProductNameForSession: 'Desk Radio',
        closeStreamDialog,
        setIsStartingStream,
        feedback,
      }),
    );

    await act(async () => {
      const startPromise = result.current.handleStartStream();
      await Promise.resolve();
      await jest.runAllTimersAsync();
      await startPromise;
    });

    expect(setIsStartingStream).toHaveBeenNthCalledWith(1, true);
    expect(mockStartYouTubeStream).toHaveBeenCalledWith('cam-1', {
      product_id: 42,
      title: 'Desk Radio Live',
      privacy_status: 'unlisted',
    });
    expect(mockSetActiveStream).toHaveBeenCalledWith({
      cameraId: 'cam-1',
      cameraName: 'Camera 1',
      productId: 42,
      productName: 'Desk Radio',
      startedAt: '2026-01-01T00:00:00.000Z',
      youtubeUrl: 'https://youtube.test/watch?v=abc',
    });
    expect(closeStreamDialog).toHaveBeenCalled();
    expect(mockAddProductVideo).toHaveBeenCalled();
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ['product', 42] });
    expect(setSnackbar).toHaveBeenCalledWith('Now live: Camera 1');
    expect(mockBack).toHaveBeenCalled();
    expect(setIsStartingStream).toHaveBeenLastCalledWith(false);

    mockStartYouTubeStream.mockImplementationOnce(async () => {
      throw new Error('GOOGLE_OAUTH_REQUIRED');
    });
    await act(async () => {
      await result.current.handleStartStream();
    });
    expect(feedback.alert).toHaveBeenCalled();

    mockStartYouTubeStream.mockImplementationOnce(async () => {
      throw new Error('camera exploded');
    });
    await act(async () => {
      await result.current.handleStartStream();
    });
    expect(feedback.error).toHaveBeenCalledWith(
      'Failed to start stream: camera exploded',
      'Stream start failed',
    );
  });
});
