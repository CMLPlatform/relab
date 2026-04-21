import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, renderHook } from '@testing-library/react-native';
import { useCameraStreamPicker } from '@/hooks/useCameraStreamPicker';
import { addProductVideo } from '@/services/api/products';
import { startYouTubeStream } from '@/services/api/rpiCamera';

const mockSetActiveStream = jest.fn();
const mockAlert = jest.fn();
const mockInvalidateQueries = jest.fn();

jest.mock('@tanstack/react-query', () => {
  const actual = jest.requireActual('@tanstack/react-query') as object;
  return {
    ...actual,
    useQueryClient: () => ({
      invalidateQueries: mockInvalidateQueries,
    }),
  };
});

jest.mock('@/context/streamSession', () => ({
  useStreamSession: () => ({
    setActiveStream: mockSetActiveStream,
  }),
}));

jest.mock('@/hooks/useAppFeedback', () => ({
  useAppFeedback: () => ({
    alert: mockAlert,
    error: jest.fn((message: string, title?: string) =>
      mockAlert({
        title,
        message,
        buttons: [{ text: 'OK' }],
      }),
    ),
  }),
}));

jest.mock('@/services/api/products', () => ({
  addProductVideo: jest.fn(),
}));

jest.mock('@/services/api/rpiCamera', () => ({
  startYouTubeStream: jest.fn(),
}));

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: this hook suite shares one stream-picker harness across many flow permutations.
describe('useCameraStreamPicker', () => {
  const startYouTubeStreamMock = jest.mocked(startYouTubeStream);
  const addProductVideoMock = jest.mocked(addProductVideo);

  beforeEach(() => {
    jest.clearAllMocks();
    startYouTubeStreamMock.mockResolvedValue({
      mode: 'youtube',
      provider: 'youtube',
      started_at: '2026-04-15T10:00:00.000Z',
      url: 'https://youtube.test/watch?v=123',
      metadata: {
        camera_properties: {},
        capture_metadata: {},
        fps: null,
      },
    });
    addProductVideoMock.mockResolvedValue(undefined);
  });

  it('starts in camera-selection mode and transitions into config mode when a camera is chosen', () => {
    const { result } = renderHook(() =>
      useCameraStreamPicker({
        productId: 9,
        productName: 'Desk Radio',
        onDismiss: jest.fn(),
      }),
    );

    expect(result.current.state.isSelectingCamera).toBe(true);
    expect(result.current.state.config).toBeNull();

    act(() => {
      result.current.actions.handleCameraSelect({ id: 'cam-1', name: 'Bench Cam' } as never);
    });

    expect(result.current.state.isSelectingCamera).toBe(false);
    expect(result.current.state.config).toMatchObject({
      camera: { id: 'cam-1', name: 'Bench Cam' },
      title: 'Desk Radio',
      privacy: 'private',
    });
  });

  it('supports editing title/privacy plus back and dismiss flows', () => {
    const onDismiss = jest.fn();
    const { result } = renderHook(() =>
      useCameraStreamPicker({
        productId: 9,
        productName: 'Desk Radio',
        onDismiss,
      }),
    );

    act(() => {
      result.current.actions.handleCameraSelect({ id: 'cam-1', name: 'Bench Cam' } as never);
      result.current.actions.setTitle('Live teardown');
      result.current.actions.setPrivacy('unlisted');
    });

    expect(result.current.state.config).toMatchObject({
      title: 'Live teardown',
      privacy: 'unlisted',
    });

    act(() => {
      result.current.actions.handleBack();
    });

    expect(result.current.state.config).toBeNull();

    act(() => {
      result.current.actions.handleDismiss();
    });

    expect(onDismiss).toHaveBeenCalled();
  });

  it('starts a stream, persists product video metadata, and dismisses on success', async () => {
    const onDismiss = jest.fn();
    const { result } = renderHook(() =>
      useCameraStreamPicker({
        productId: 9,
        productName: 'Desk Radio',
        onDismiss,
      }),
    );

    act(() => {
      result.current.actions.handleCameraSelect({ id: 'cam-1', name: 'Bench Cam' } as never);
      result.current.actions.setTitle('  Live teardown  ');
    });

    await act(async () => {
      await result.current.actions.handleStartStream();
    });

    expect(startYouTubeStreamMock).toHaveBeenCalledWith('cam-1', {
      product_id: 9,
      title: 'Live teardown',
      privacy_status: 'private',
    });
    expect(mockSetActiveStream).toHaveBeenCalledWith({
      cameraId: 'cam-1',
      cameraName: 'Bench Cam',
      productId: 9,
      productName: 'Desk Radio',
      startedAt: '2026-04-15T10:00:00.000Z',
      youtubeUrl: 'https://youtube.test/watch?v=123',
    });
    expect(addProductVideoMock).toHaveBeenCalledWith(9, {
      url: 'https://youtube.test/watch?v=123',
      title: 'Live teardown',
      description: '',
    });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ['product', 9] });
    expect(onDismiss).toHaveBeenCalled();
    expect(result.current.state.isStarting).toBe(false);
  });

  it('falls back to generic title when the configured title is blank', async () => {
    const { result } = renderHook(() =>
      useCameraStreamPicker({
        productId: 9,
        productName: 'Desk Radio',
        onDismiss: jest.fn(),
      }),
    );

    act(() => {
      result.current.actions.handleCameraSelect({ id: 'cam-1', name: 'Bench Cam' } as never);
      result.current.actions.setTitle('   ');
    });

    await act(async () => {
      await result.current.actions.handleStartStream();
    });

    expect(startYouTubeStreamMock).toHaveBeenCalledWith('cam-1', {
      product_id: 9,
      title: undefined,
      privacy_status: 'private',
    });
    expect(addProductVideoMock).toHaveBeenCalledWith(
      9,
      expect.objectContaining({ title: 'Live stream' }),
    );
  });

  it('shows the Google account required message when YouTube OAuth is missing', async () => {
    startYouTubeStreamMock.mockRejectedValue(new Error('GOOGLE_OAUTH_REQUIRED'));
    const { result } = renderHook(() =>
      useCameraStreamPicker({
        productId: 9,
        productName: 'Desk Radio',
        onDismiss: jest.fn(),
      }),
    );

    act(() => {
      result.current.actions.handleCameraSelect({ id: 'cam-1', name: 'Bench Cam' } as never);
    });

    await act(async () => {
      await result.current.actions.handleStartStream();
    });

    expect(mockAlert).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Google account required' }),
    );
    expect(result.current.state.isStarting).toBe(false);
  });

  it('shows generic stream-start feedback for non-OAuth failures', async () => {
    startYouTubeStreamMock.mockRejectedValue(new Error('stream backend unavailable'));
    const { result } = renderHook(() =>
      useCameraStreamPicker({
        productId: 9,
        productName: 'Desk Radio',
        onDismiss: jest.fn(),
      }),
    );

    act(() => {
      result.current.actions.handleCameraSelect({ id: 'cam-1', name: 'Bench Cam' } as never);
    });

    await act(async () => {
      await result.current.actions.handleStartStream();
    });

    expect(mockAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Stream start failed',
        message: 'Failed to start stream: stream backend unavailable',
      }),
    );
    expect(mockSetActiveStream).not.toHaveBeenCalled();
  });

  it('no-ops when start is requested before a camera has been selected', async () => {
    const { result } = renderHook(() =>
      useCameraStreamPicker({
        productId: 9,
        productName: 'Desk Radio',
        onDismiss: jest.fn(),
      }),
    );

    await act(async () => {
      await result.current.actions.handleStartStream();
    });

    expect(startYouTubeStreamMock).not.toHaveBeenCalled();
    expect(addProductVideoMock).not.toHaveBeenCalled();
  });
});
