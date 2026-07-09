import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, renderHook } from '@testing-library/react-native';
import { useCameraStreamActions } from '@/features/cameras/youtube/streamActions';
import { ApiError } from '@/services/api/errors';

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

jest.mock('@/context/streamSession', () => ({
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

describe('camera stream action hooks', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAddProductVideo.mockImplementation(async () => undefined);
    mockStartYouTubeStream.mockImplementation(async () => ({
      started_at: '2026-01-01T00:00:00.000Z',
      url: 'https://youtube.test/watch?v=abc',
    }));
  });

  it('routes stream-mode taps, detail navigation, and offline warnings correctly', () => {
    const openStreamDialog = jest.fn();
    const toggleSelected = jest.fn();
    const setSnackbar = jest.fn();
    const feedback = { alert: jest.fn(), error: jest.fn(), toast: jest.fn() };

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

  function renderStartStream() {
    const closeStreamDialog = jest.fn();
    const setIsStartingStream = jest.fn();
    const setSnackbar = jest.fn();
    const feedback = { alert: jest.fn(), error: jest.fn(), toast: jest.fn() };

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

    return { result, closeStreamDialog, setIsStartingStream, setSnackbar, feedback };
  }

  it('starts a stream successfully and handles start failures', async () => {
    const { result, closeStreamDialog, setIsStartingStream, feedback } = renderStartStream();

    await act(async () => {
      await result.current.handleStartStream();
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
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ['baseProduct', 42] });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ['component', 42] });
    // The toast outlives the screen pop, so no delay is needed before back().
    expect(feedback.toast).toHaveBeenCalledWith('Now live: Camera 1');
    expect(mockBack).toHaveBeenCalled();
    expect(setIsStartingStream).toHaveBeenLastCalledWith(false);

    mockStartYouTubeStream.mockImplementationOnce(async () => {
      throw new ApiError('Google account not linked', 403, 'GOOGLE_OAUTH_REQUIRED');
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

  it('shows a distinct already-live dialog on a 409 rather than a generic failure', async () => {
    mockStartYouTubeStream.mockImplementationOnce(async () => {
      throw new ApiError(
        'A stream is already active for this camera.',
        409,
        'STREAM_ALREADY_ACTIVE',
      );
    });
    const { result, closeStreamDialog, feedback } = renderStartStream();

    await act(async () => {
      await result.current.handleStartStream();
    });

    expect(feedback.alert).toHaveBeenCalledWith(expect.objectContaining({ title: 'Already live' }));
    expect(feedback.error).not.toHaveBeenCalled();
    expect(closeStreamDialog).not.toHaveBeenCalled();
    expect(mockBack).not.toHaveBeenCalled();
  });

  // Regression: addProductVideo used to be fire-and-forget with an empty catch,
  // so a failed video save was invisible to the user.
  it('surfaces a failure to save the stream video without failing the start', async () => {
    mockAddProductVideo.mockImplementationOnce(async () => {
      throw new Error('disk full');
    });
    const { result, closeStreamDialog, feedback } = renderStartStream();

    await act(async () => {
      await result.current.handleStartStream();
    });

    expect(feedback.error).toHaveBeenCalledWith(
      'The stream is live, but saving it to the product failed: disk full',
      'Video not saved',
    );
    // The broadcast is live, so the flow still succeeds.
    expect(closeStreamDialog).toHaveBeenCalled();
    expect(feedback.toast).toHaveBeenCalledWith('Now live: Camera 1');
    expect(mockBack).toHaveBeenCalled();
  });

  it('does not start a stream when no product is selected', async () => {
    const feedback = { alert: jest.fn(), error: jest.fn(), toast: jest.fn() };
    const { result } = renderHook(() =>
      useCameraStreamActions({
        streamModeEnabled: true,
        selectionMode: false,
        isCameraReachable: () => true,
        openStreamDialog: jest.fn(),
        streamProductName: 'Desk Radio',
        toggleSelected: jest.fn(),
        setSnackbar: jest.fn(),
        streamDialog: {
          cameraId: 'cam-1',
          cameraName: 'Camera 1',
          title: 'Desk Radio',
          privacy: 'private',
        },
        streamProductId: null,
        closeStreamDialog: jest.fn(),
        setIsStartingStream: jest.fn(),
        feedback,
      }),
    );

    await act(async () => {
      await result.current.handleStartStream();
    });

    expect(mockStartYouTubeStream).not.toHaveBeenCalled();
  });
});
