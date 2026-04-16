import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, screen } from '@testing-library/react-native';
import { Linking } from 'react-native';
import { StreamingContent } from '@/components/common/StreamingContent';
import { renderWithProviders } from '@/test-utils';

const mockPush = jest.fn();
const mockSetActiveStream = jest.fn();
const mockFeedback = {
  alert: jest.fn(),
  error: jest.fn(),
  toast: jest.fn(),
  success: jest.fn(),
  input: jest.fn(),
};
const mockStopMutate = jest.fn();
const mockInvalidateProductQuery = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock('@/components/cameras/LivePreview', () => ({
  LivePreview: () => null,
}));

jest.mock('@/context/StreamSessionContext', () => ({
  useStreamSession: () => ({ setActiveStream: mockSetActiveStream }),
}));

jest.mock('@/hooks/useAppFeedback', () => ({
  useAppFeedback: () => mockFeedback,
}));

jest.mock('@/hooks/useElapsed', () => ({
  useElapsed: () => '2:34',
}));

jest.mock('@/hooks/useRpiCameras', () => ({
  useStopYouTubeStreamMutation: () => ({
    mutate: (...args: unknown[]) => mockStopMutate(...args),
    isPending: false,
  }),
}));

jest.mock('@/hooks/camera-data/mutations', () => ({
  invalidateProductQuery: (...args: unknown[]) => mockInvalidateProductQuery(...args),
}));

describe('StreamingContent', () => {
  const session = {
    cameraId: 'cam-1',
    cameraName: 'Bench Cam',
    productId: 42,
    productName: 'Desk Radio',
    startedAt: '2026-01-01T00:00:00.000Z',
    youtubeUrl: 'https://youtube.test/watch?v=123',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    mockStopMutate.mockImplementation((...args: unknown[]) => {
      const options = args[1] as { onSuccess?: () => void } | undefined;
      options?.onSuccess?.();
    });
  });

  it('renders live state, elapsed time, and the optional product link', () => {
    renderWithProviders(<StreamingContent session={session} showProductLink />, {
      withDialog: true,
    });

    expect(screen.getByText('LIVE')).toBeOnTheScreen();
    expect(screen.getByText('2:34')).toBeOnTheScreen();
    expect(screen.getByText('Go to Desk Radio')).toBeOnTheScreen();
  });

  it('opens the YouTube URL and navigates to the product page', () => {
    const onStop = jest.fn();
    renderWithProviders(<StreamingContent session={session} showProductLink onStop={onStop} />, {
      withDialog: true,
    });

    fireEvent.press(screen.getByText('Watch on YouTube'));
    fireEvent.press(screen.getByText('Go to Desk Radio'));

    expect(Linking.openURL).toHaveBeenCalledWith(session.youtubeUrl);
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/products/[id]',
      params: { id: '42' },
    });
    expect(onStop).toHaveBeenCalledTimes(1);
  });

  it('stops the stream successfully and clears the active session', () => {
    const onStop = jest.fn();
    renderWithProviders(<StreamingContent session={session} onStop={onStop} />, {
      withDialog: true,
    });

    fireEvent.press(screen.getByText('Stop stream'));

    expect(mockSetActiveStream).toHaveBeenCalledWith(null);
    expect(mockInvalidateProductQuery).toHaveBeenCalled();
    expect(onStop).toHaveBeenCalled();
  });

  it('shows an error when stopping the stream fails', () => {
    mockStopMutate.mockImplementation((...args: unknown[]) => {
      const options = args[1] as { onError?: (error: unknown) => void } | undefined;
      options?.onError?.(new Error('stop failed hard'));
    });

    renderWithProviders(<StreamingContent session={session} />, {
      withDialog: true,
    });

    fireEvent.press(screen.getByText('Stop stream'));

    expect(mockFeedback.error).toHaveBeenCalledWith(
      'Failed to stop stream: stop failed hard',
      'Stop failed',
    );
    expect(mockSetActiveStream).not.toHaveBeenCalled();
  });
});
