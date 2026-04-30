import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { addProductVideo } from '@/services/api/products';
import { startYouTubeStream } from '@/services/api/rpiCamera';
import { fireEvent, renderWithProviders, screen, waitFor } from '@/test-utils/index';
import { CameraStreamPicker } from '../CameraStreamPicker';

const mockSetActiveStream = jest.fn();
const mockAlert = jest.fn();
const mockInvalidateQueries = jest.fn();
const startYouTubeStreamMock = jest.mocked(startYouTubeStream);
const addProductVideoMock = jest.mocked(addProductVideo);

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

jest.mock('../CameraPickerDialog', () => ({
  CameraPickerDialog: ({
    visible,
    onSelect,
  }: {
    visible: boolean;
    onSelect: (camera: { id: string; name: string }) => void;
  }) => {
    if (!visible) return null;
    const { Pressable, Text } = require('react-native');
    return (
      <Pressable onPress={() => onSelect({ id: 'cam-1', name: 'Bench Cam' })}>
        <Text>Select camera</Text>
      </Pressable>
    );
  },
}));

describe('CameraStreamPicker', () => {
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

  it('starts a stream and closes after camera selection and config confirmation', async () => {
    const onDismiss = jest.fn();

    renderWithProviders(
      <CameraStreamPicker productId={9} productName="Desk Radio" visible onDismiss={onDismiss} />,
    );

    fireEvent.press(screen.getByText('Select camera'));

    expect(screen.getByText('Go Live on Bench Cam')).toBeOnTheScreen();
    fireEvent.changeText(screen.getByDisplayValue('Desk Radio'), 'Live teardown');
    fireEvent.press(screen.getByText('Go Live'));

    await waitFor(() => {
      expect(startYouTubeStreamMock).toHaveBeenCalledWith('cam-1', {
        product_id: 9,
        title: 'Live teardown',
        privacy_status: 'private',
      });
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
  });

  it('shows the Google account required message when YouTube OAuth is missing', async () => {
    startYouTubeStreamMock.mockRejectedValue(new Error('GOOGLE_OAUTH_REQUIRED'));

    renderWithProviders(
      <CameraStreamPicker productId={9} productName="Desk Radio" visible onDismiss={jest.fn()} />,
    );

    fireEvent.press(screen.getByText('Select camera'));
    fireEvent.press(screen.getByText('Go Live'));

    await waitFor(() => {
      expect(mockAlert).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Google account required' }),
      );
    });
  });
});
