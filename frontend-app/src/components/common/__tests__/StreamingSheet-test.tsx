import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, screen } from '@testing-library/react-native';
import { StreamingSheet } from '@/components/common/StreamingSheet';
import { renderWithProviders } from '@/test-utils';

const mockStreamingContent = jest.fn();

jest.mock('@/components/common/StreamingContent', () => ({
  StreamingContent: (props: unknown) => {
    mockStreamingContent(props);
    return null;
  },
}));

describe('StreamingSheet', () => {
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
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('renders nothing when hidden or when session is missing', () => {
    const { rerender } = renderWithProviders(
      <StreamingSheet visible={false} onDismiss={jest.fn()} session={session} />,
    );

    expect(screen.queryByLabelText('Close')).toBeNull();
    expect(mockStreamingContent).not.toHaveBeenCalled();

    rerender(<StreamingSheet visible session={null} onDismiss={jest.fn()} />);

    expect(screen.queryByLabelText('Close')).toBeNull();
    expect(mockStreamingContent).not.toHaveBeenCalled();
  });

  it('renders the sheet contents and dismisses from backdrop and close button', () => {
    const onDismiss = jest.fn();
    renderWithProviders(<StreamingSheet visible session={session} onDismiss={onDismiss} />);

    expect(screen.getByText('Bench Cam')).toBeOnTheScreen();
    expect(screen.getByLabelText('Close')).toBeOnTheScreen();
    expect(mockStreamingContent).toHaveBeenCalledWith(
      expect.objectContaining({
        session,
        onStop: onDismiss,
        showProductLink: true,
      }),
    );

    fireEvent.press(screen.getByLabelText('Close'));

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
