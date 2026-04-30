import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, renderHook } from '@testing-library/react-native';
import { useYouTubeStreamCard } from '@/hooks/useYouTubeStreamCard';
import { openExternalUrl } from '@/services/externalLinks';

const mockSetActiveStream = jest.fn();
const mockAlert = jest.fn();
const mockError = jest.fn();
const mockMutate = jest.fn();
const mockUseYouTubeIntegration = jest.fn();
const mockUseStreamStatusQuery = jest.fn();
const mockUseStopYouTubeStreamMutation = jest.fn();

jest.mock('@/services/externalLinks', () => ({
  __esModule: true,
  openExternalUrl: require('@jest/globals').jest.fn(),
}));

const openExternalUrlMock = openExternalUrl as jest.MockedFunction<typeof openExternalUrl>;

jest.mock('@/context/streamSession', () => ({
  useStreamSession: () => ({
    setActiveStream: mockSetActiveStream,
  }),
}));

jest.mock('@/hooks/useAppFeedback', () => ({
  useAppFeedback: () => ({
    alert: mockAlert,
    error: mockError,
  }),
}));

jest.mock('@/hooks/useElapsed', () => ({
  useElapsed: () => '1:23',
}));

jest.mock('@/hooks/useYouTubeIntegration', () => ({
  useYouTubeIntegration: () => mockUseYouTubeIntegration(),
}));

jest.mock('@/hooks/useRpiCameras', () => ({
  useStreamStatusQuery: (...args: unknown[]) => mockUseStreamStatusQuery(...args),
  useStopYouTubeStreamMutation: (...args: unknown[]) => mockUseStopYouTubeStreamMutation(...args),
}));

describe('useYouTubeStreamCard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    openExternalUrlMock.mockResolvedValue(true);
    mockUseYouTubeIntegration.mockReturnValue({ enabled: true });
    mockUseStreamStatusQuery.mockReturnValue({
      data: {
        url: 'https://youtube.test/watch?v=abc',
        started_at: '2026-04-15T10:00:00.000Z',
      },
      isLoading: false,
    });
    mockUseStopYouTubeStreamMutation.mockReturnValue({
      mutate: mockMutate,
      isPending: false,
    });
  });

  it('returns the current live stream state and uses the integration gate in the query options', () => {
    const { result } = renderHook(() => useYouTubeStreamCard('cam-1', true));

    expect(mockUseStreamStatusQuery).toHaveBeenCalledWith('cam-1', { enabled: true });
    expect(result.current.state).toMatchObject({
      youtubeEnabled: true,
      statusLoading: false,
      isLive: true,
      isStopping: false,
      elapsed: '1:23',
    });
    expect(result.current.state.streamStatus).toEqual({
      url: 'https://youtube.test/watch?v=abc',
      started_at: '2026-04-15T10:00:00.000Z',
    });
  });

  it('disables the status query when the camera is offline or YouTube is disabled', () => {
    mockUseYouTubeIntegration.mockReturnValue({ enabled: false });

    renderHook(() => useYouTubeStreamCard('cam-2', false));

    expect(mockUseStreamStatusQuery).toHaveBeenCalledWith('cam-2', { enabled: false });
  });

  it('opens the YouTube URL when watch is triggered and the stream has a URL', () => {
    const { result } = renderHook(() => useYouTubeStreamCard('cam-1', true));

    act(() => {
      result.current.actions.handleWatch();
    });

    expect(openExternalUrlMock).toHaveBeenCalledWith('https://youtube.test/watch?v=abc');
  });

  it('does nothing when watch is triggered without a stream URL', () => {
    mockUseStreamStatusQuery.mockReturnValue({
      data: { started_at: '2026-04-15T10:00:00.000Z', url: '' },
      isLoading: false,
    });

    const { result } = renderHook(() => useYouTubeStreamCard('cam-1', true));

    act(() => {
      result.current.actions.handleWatch();
    });

    expect(openExternalUrlMock).not.toHaveBeenCalled();
  });

  it('confirms stop and clears the active stream on successful stop', () => {
    const { result } = renderHook(() => useYouTubeStreamCard('cam-1', true));

    act(() => {
      result.current.actions.handleStop();
    });

    expect(mockAlert).toHaveBeenCalledWith(expect.objectContaining({ title: 'End live stream?' }));

    const alertConfig = mockAlert.mock.calls[0]?.[0] as {
      buttons: { text: string; onPress?: () => void }[];
    };
    const endStreamButton = alertConfig.buttons.find((button) => button.text === 'End Stream');

    act(() => {
      endStreamButton?.onPress?.();
    });

    expect(mockMutate).toHaveBeenCalledWith(
      undefined,
      expect.objectContaining({
        onSuccess: expect.any(Function),
        onError: expect.any(Function),
      }),
    );

    const mutateOptions = mockMutate.mock.calls[0]?.[1] as { onSuccess: () => void };
    mutateOptions.onSuccess();

    expect(mockSetActiveStream).toHaveBeenCalledWith(null);
  });

  it('routes stop failures through shared feedback', () => {
    const { result } = renderHook(() => useYouTubeStreamCard('cam-1', true));

    act(() => {
      result.current.actions.handleStop();
    });

    const alertConfig = mockAlert.mock.calls[0]?.[0] as {
      buttons: { text: string; onPress?: () => void }[];
    };
    const endStreamButton = alertConfig.buttons.find((button) => button.text === 'End Stream');

    act(() => {
      endStreamButton?.onPress?.();
    });

    const mutateOptions = mockMutate.mock.calls[0]?.[1] as { onError: (error: Error) => void };
    mutateOptions.onError(new Error('network down'));

    expect(mockError).toHaveBeenCalledWith('Failed to stop stream: network down', 'Stop failed');
  });
});
