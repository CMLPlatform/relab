import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, screen } from '@testing-library/react-native';
import { WebHlsVideo } from '@/components/cameras/live-preview/WebHlsVideo';
import { renderWithProviders } from '@/test-utils/index';

const mockPlaybackState = {
  state: 'loading' as 'loading' | 'live' | 'error',
  errorMessage: null as string | null,
  retryKey: 0,
  retryNow: jest.fn(),
  markLive: jest.fn(),
  markError: jest.fn(),
  handleFatalError: jest.fn(),
  resetForSourceChange: jest.fn(),
  clearRetryTimer: jest.fn(),
};

jest.mock('@/components/cameras/live-preview/useWebHlsPlayback', () => ({
  useWebHlsPlayback: () => mockPlaybackState,
}));

describe('WebHlsVideo', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPlaybackState.state = 'loading';
    mockPlaybackState.errorMessage = null;
  });

  it('shows the loading overlay while playback is starting', () => {
    renderWithProviders(<WebHlsVideo src="https://cam.test/live.m3u8" />);

    expect(screen.getByText('Loading preview…')).toBeOnTheScreen();
    expect(mockPlaybackState.clearRetryTimer).toHaveBeenCalled();
    expect(mockPlaybackState.resetForSourceChange).toHaveBeenCalled();
  });

  it('shows the retry overlay when playback is in an error state', () => {
    mockPlaybackState.state = 'error';
    mockPlaybackState.errorMessage = 'Live preview unavailable';

    renderWithProviders(<WebHlsVideo src="https://cam.test/live.m3u8" />);

    expect(screen.getByText('Live preview unavailable')).toBeOnTheScreen();

    fireEvent.press(screen.getByText('Tap to retry'));
    expect(mockPlaybackState.retryNow).toHaveBeenCalled();
  });

  it('renders without overlays once playback is live', () => {
    mockPlaybackState.state = 'live';

    renderWithProviders(<WebHlsVideo src="https://cam.test/live.m3u8" />);

    expect(screen.queryByText('Loading preview…')).toBeNull();
    expect(screen.queryByText('Tap to retry')).toBeNull();
  });
});
