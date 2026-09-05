import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { WebHlsVideo } from '@/components/cameras/live-preview/WebHlsVideo';
import { renderWithProviders } from '@/test-utils/index';

type SetupArgs = {
  markLive: () => void;
  markError: (message: string) => void;
};

const mockCleanup = jest.fn();
const mockSetup = jest.fn<(args: SetupArgs) => Promise<() => void>>();

jest.mock('@/components/cameras/live-preview/webHlsVideoHelpers', () => ({
  setupWebHlsVideo: (args: SetupArgs) => mockSetup(args),
}));

/** The <video> host element needs a non-null ref for the setup effect to run. */
function renderPlayer(src = 'https://cam.test/live.m3u8') {
  return renderWithProviders(<WebHlsVideo src={src} />, {
    createNodeMock: () => ({}),
  });
}

function lastSetupArgs(): SetupArgs {
  const call = mockSetup.mock.calls.at(-1);
  if (!call) throw new Error('setupWebHlsVideo was never called');
  return call[0];
}

describe('WebHlsVideo', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSetup.mockImplementation(async () => mockCleanup);
  });

  it('shows the loading overlay while playback is starting', async () => {
    renderPlayer();

    expect(screen.getByText('Loading preview…')).toBeOnTheScreen();
    await waitFor(() => expect(mockSetup).toHaveBeenCalledTimes(1));
  });

  it('renders without overlays once playback is live', async () => {
    renderPlayer();
    await waitFor(() => expect(mockSetup).toHaveBeenCalledTimes(1));

    await act(async () => lastSetupArgs().markLive());

    expect(screen.queryByText('Loading preview…')).toBeNull();
    expect(screen.queryByText('Tap to retry')).toBeNull();
  });

  it('shows the retry overlay when setup reports an unrecoverable error', async () => {
    renderPlayer();
    await waitFor(() => expect(mockSetup).toHaveBeenCalledTimes(1));

    await act(async () => lastSetupArgs().markError('Live preview unavailable'));

    expect(screen.getByText('Live preview unavailable')).toBeOnTheScreen();
  });

  // Regression: retryKey must be wired into the setup effect's deps, otherwise
  // the retry button clears the overlay but never re-attaches the player.
  it('re-runs setup when the user taps retry', async () => {
    renderPlayer();
    await waitFor(() => expect(mockSetup).toHaveBeenCalledTimes(1));
    await act(async () => lastSetupArgs().markError('fatal'));

    fireEvent.press(screen.getByText('Tap to retry'));

    await waitFor(() => expect(mockSetup).toHaveBeenCalledTimes(2));
    expect(mockCleanup).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Loading preview…')).toBeOnTheScreen();
  });

  it('tears down and re-attaches the player when the source changes', async () => {
    const { rerender } = renderPlayer('https://cam.test/a.m3u8');
    await waitFor(() => expect(mockSetup).toHaveBeenCalledTimes(1));

    rerender(<WebHlsVideo src="https://cam.test/b.m3u8" />);

    await waitFor(() => expect(mockSetup).toHaveBeenCalledTimes(2));
    expect(mockCleanup).toHaveBeenCalledTimes(1);
  });
});
