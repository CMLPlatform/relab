import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, screen } from '@testing-library/react-native';
import { ActiveStreamBanner } from '@/components/common/ActiveStreamBanner';
import { renderWithProviders } from '@/test-utils';

const mockStreamingSheet = jest.fn();
const mockUseStreamSession = jest.fn();

jest.mock('@/components/common/StreamingSheet', () => ({
  StreamingSheet: (props: unknown) => {
    mockStreamingSheet(props);
    return null;
  },
}));

jest.mock('@/context/StreamSessionContext', () => ({
  useStreamSession: () => mockUseStreamSession(),
}));

jest.mock('@/hooks/useElapsed', () => ({
  useElapsed: () => '1:23',
}));

describe('ActiveStreamBanner', () => {
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
  });

  it('renders nothing when there is no active stream', () => {
    mockUseStreamSession.mockReturnValue({ activeStream: null });

    renderWithProviders(<ActiveStreamBanner />);

    expect(screen.queryByLabelText('Manage live stream')).toBeNull();
    expect(mockStreamingSheet).not.toHaveBeenCalled();
  });

  it('renders the active stream banner and opens the sheet when pressed', () => {
    mockUseStreamSession.mockReturnValue({ activeStream: session });

    renderWithProviders(<ActiveStreamBanner />);

    expect(screen.getByText('Desk Radio')).toBeOnTheScreen();
    expect(screen.getByText('1:23')).toBeOnTheScreen();
    expect(mockStreamingSheet).toHaveBeenLastCalledWith(
      expect.objectContaining({
        visible: false,
        session,
      }),
    );

    fireEvent.press(screen.getByLabelText('Manage live stream'));

    expect(mockStreamingSheet).toHaveBeenLastCalledWith(
      expect.objectContaining({
        visible: true,
        session,
      }),
    );
  });
});
