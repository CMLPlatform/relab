import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import * as productApi from '@/services/api/products';
import * as rpiCameraApi from '@/services/api/rpiCamera';
import { fireEvent, renderWithProviders, screen, waitFor } from '@/test-utils';
import { CameraStreamPicker } from '../CameraStreamPicker';

const mockSetActiveStream = jest.fn();
const mockAlert = jest.fn();
const mockInvalidateQueries = jest.fn();
let startYouTubeStreamSpy: jest.SpiedFunction<typeof rpiCameraApi.startYouTubeStream>;
let addProductVideoSpy: jest.SpiedFunction<typeof productApi.addProductVideo>;

jest.mock('@tanstack/react-query', () => {
  const actual = jest.requireActual('@tanstack/react-query') as object;
  return {
    ...actual,
    useQueryClient: () => ({
      invalidateQueries: mockInvalidateQueries,
    }),
  };
});

jest.mock('@/context/StreamSessionContext', () => ({
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
    startYouTubeStreamSpy = jest.spyOn(rpiCameraApi, 'startYouTubeStream');
    addProductVideoSpy = jest.spyOn(productApi, 'addProductVideo');

    startYouTubeStreamSpy.mockResolvedValue({
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
    addProductVideoSpy.mockResolvedValue(undefined);
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
      expect(startYouTubeStreamSpy).toHaveBeenCalledWith('cam-1', {
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
    expect(addProductVideoSpy).toHaveBeenCalledWith(9, {
      url: 'https://youtube.test/watch?v=123',
      title: 'Live teardown',
      description: '',
    });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ['product', 9] });
    expect(onDismiss).toHaveBeenCalled();
  });

  it('shows the Google account required message when YouTube OAuth is missing', async () => {
    startYouTubeStreamSpy.mockRejectedValue(new Error('GOOGLE_OAUTH_REQUIRED'));

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
