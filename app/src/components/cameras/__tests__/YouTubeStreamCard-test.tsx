import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, renderWithProviders, screen, waitFor } from '@/test-utils/index';
import { YouTubeStreamCard } from '../YouTubeStreamCard';

const mockSetActiveStream = jest.fn();
const mockAlert = jest.fn();
const mockError = jest.fn();
const mockMutate = jest.fn();
const mockUseYouTubeIntegration = jest.fn();
const mockUseStreamStatusQuery = jest.fn();
const mockUseStopYouTubeStreamMutation = jest.fn();

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

describe('YouTubeStreamCard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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

  it('renders live stream details when a stream is active', () => {
    renderWithProviders(<YouTubeStreamCard cameraId="cam-1" isOnline />);

    expect(screen.getByText('YouTube Live')).toBeOnTheScreen();
    expect(screen.getByText('Live for 1:23')).toBeOnTheScreen();
    expect(screen.getByText('https://youtube.test/watch?v=abc')).toBeOnTheScreen();
  });

  it('confirms stopping a stream and clears the active session on success', async () => {
    renderWithProviders(<YouTubeStreamCard cameraId="cam-1" isOnline />);

    fireEvent.press(screen.getByText('Stop stream'));

    expect(mockAlert).toHaveBeenCalledWith(expect.objectContaining({ title: 'End live stream?' }));

    const alertConfig = mockAlert.mock.calls[0][0] as {
      buttons: { text: string; onPress?: () => void }[];
    };
    const endStreamButton = alertConfig.buttons.find((button) => button.text === 'End Stream');
    endStreamButton?.onPress?.();

    expect(mockMutate).toHaveBeenCalledWith(
      undefined,
      expect.objectContaining({
        onSuccess: expect.any(Function),
        onError: expect.any(Function),
      }),
    );

    const mutateOptions = mockMutate.mock.calls[0][1] as { onSuccess: () => void };
    mutateOptions.onSuccess();

    await waitFor(() => {
      expect(mockSetActiveStream).toHaveBeenCalledWith(null);
    });
  });

  it('shows an error when stopping the stream fails', async () => {
    renderWithProviders(<YouTubeStreamCard cameraId="cam-1" isOnline />);

    fireEvent.press(screen.getByText('Stop stream'));

    const alertConfig = mockAlert.mock.calls[0][0] as {
      buttons: { text: string; onPress?: () => void }[];
    };
    const endStreamButton = alertConfig.buttons.find((button) => button.text === 'End Stream');
    endStreamButton?.onPress?.();

    const mutateOptions = mockMutate.mock.calls[0][1] as { onError: (error: Error) => void };
    mutateOptions.onError(new Error('network down'));

    await waitFor(() => {
      expect(mockError).toHaveBeenCalledWith('Failed to stop stream: network down', 'Stop failed');
    });
  });
});
