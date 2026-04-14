import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { renderWithProviders } from '@/test-utils';
import CameraDetailScreen from '../[id]';

jest.mock('expo-image', () => ({
  Image: ({ source }: { source: { uri: string } }) => {
    const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
    const React = jest.requireActual<typeof import('react')>('react');
    return React.createElement(Text, null, `img:${source?.uri}`);
  },
}));

const mockUseAuth = jest.fn();
const mockUseCameraQuery = jest.fn();
const mockUseCameraPreview = jest.fn();
const mockUseUpdateCameraMutation = jest.fn();
const mockUseDeleteCameraMutation = jest.fn();
const mockUpdateMutate = jest.fn();
const mockDeleteMutate = jest.fn();

jest.mock('@/context/AuthProvider', () => ({
  useAuth: () => mockUseAuth(),
}));

jest.mock('@/hooks/useRpiCameras', () => ({
  useCameraPreview: (...args: unknown[]) => mockUseCameraPreview(...args),
  useUpdateCameraMutation: () => mockUseUpdateCameraMutation(),
  useDeleteCameraMutation: () => mockUseDeleteCameraMutation(),
}));

describe('Camera detail screen', () => {
  const mockReplace = jest.fn();
  const mockNavigationSetOptions = jest.fn();
  const mockRefetch = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (useLocalSearchParams as jest.Mock).mockReturnValue({ id: 'cam-1' });
    (useRouter as jest.Mock).mockReturnValue({
      push: jest.fn(),
      replace: mockReplace,
      back: jest.fn(),
      setParams: jest.fn(),
      dismissTo: jest.fn(),
    });
    (useNavigation as jest.Mock).mockReturnValue({
      setOptions: mockNavigationSetOptions,
    });

    mockUseAuth.mockReturnValue({
      user: { id: 'user-1', email: 'test@example.com' },
    });
    mockUseCameraQuery.mockReturnValue({
      data: {
        id: 'cam-1',
        name: 'Workbench Camera',
        description: 'Bench setup',
        status: { connection: 'online' },
      },
      isLoading: false,
      isError: false,
      error: null,
      refetch: mockRefetch,
      isFetching: false,
    });
    mockUseCameraPreview.mockReturnValue({
      snapshotUrl: null,
      error: new Error('Snapshot preview unavailable while the camera is streaming.'),
    });
    mockUseUpdateCameraMutation.mockReturnValue({ mutate: mockUpdateMutate, isPending: false });
    mockUseDeleteCameraMutation.mockReturnValue({ mutate: mockDeleteMutate, isPending: false });
  });

  it('shows snapshot preview polling copy and the streaming conflict message', async () => {
    renderWithProviders(<CameraDetailScreen />);

    expect(
      await screen.findByText('Snapshot preview unavailable while the camera is streaming.'),
    ).toBeOnTheScreen();
    expect(screen.getByText('Snapshot preview · polling')).toBeOnTheScreen();
    expect(mockNavigationSetOptions).toHaveBeenCalledWith({ title: 'Workbench Camera' });
  });

  it('shows websocket offline helper copy and supports retrying camera status', async () => {
    mockUseCameraQuery.mockReturnValue({
      data: {
        id: 'cam-1',
        name: 'Workbench Camera',
        description: null,
        status: { connection: 'offline' },
      },
      isLoading: false,
      isError: false,
      error: null,
      refetch: mockRefetch,
      isFetching: false,
    });
    mockUseCameraPreview.mockReturnValue({
      snapshotUrl: null,
      error: null,
    });

    renderWithProviders(<CameraDetailScreen />);

    expect(
      await screen.findByText('Waiting for camera to connect via WebSocket relay.'),
    ).toBeOnTheScreen();

    fireEvent.press(screen.getByLabelText('Refresh status'));

    await waitFor(() => expect(mockRefetch).toHaveBeenCalled());
  });

  it('opens the edit-name dialog and saves the trimmed camera name', async () => {
    renderWithProviders(<CameraDetailScreen />, { withDialog: true });

    fireEvent.press(screen.getByLabelText('Edit name'));

    expect(screen.getByText('Edit name')).toBeOnTheScreen();
    expect(screen.getByDisplayValue('Workbench Camera')).toBeOnTheScreen();

    fireEvent.changeText(screen.getByDisplayValue('Workbench Camera'), '  Studio Camera  ');
    fireEvent.press(screen.getByText('Save'));

    expect(mockUpdateMutate).toHaveBeenCalledWith(
      { name: 'Studio Camera' },
      expect.objectContaining({
        onSuccess: expect.any(Function),
      }),
    );
  });

  it('shows a loading spinner while the camera query is in progress', () => {
    mockUseCameraQuery.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
      refetch: mockRefetch,
      isFetching: false,
    });

    renderWithProviders(<CameraDetailScreen />);

    expect(screen.queryByText('Workbench Camera')).toBeNull();
    expect(screen.queryByText('Delete camera')).toBeNull();
  });

  it('shows an error state and allows retrying when the camera query fails', async () => {
    mockUseCameraQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error('Failed to load camera'),
      refetch: mockRefetch,
      isFetching: false,
    });

    renderWithProviders(<CameraDetailScreen />);

    expect(await screen.findByText(/Failed to load camera/)).toBeOnTheScreen();
    fireEvent.press(screen.getByText('Retry'));
    expect(mockRefetch).toHaveBeenCalled();
  });

  it('opens the edit-description dialog and saves the trimmed description', async () => {
    renderWithProviders(<CameraDetailScreen />, { withDialog: true });

    fireEvent.press(screen.getByLabelText('Edit description'));

    expect(screen.getByText('Edit description')).toBeOnTheScreen();
    expect(screen.getByDisplayValue('Bench setup')).toBeOnTheScreen();

    fireEvent.changeText(screen.getByDisplayValue('Bench setup'), '  Updated description  ');
    fireEvent.press(screen.getByText('Save'));

    expect(mockUpdateMutate).toHaveBeenCalledWith(
      { description: 'Updated description' },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });

  it('opens the delete confirmation and navigates away after successful deletion', async () => {
    mockDeleteMutate.mockImplementationOnce((...args: any[]) => {
      const options = args[1] as { onSuccess?: () => void } | undefined;
      options?.onSuccess?.();
    });

    renderWithProviders(<CameraDetailScreen />, { withDialog: true });

    fireEvent.press(screen.getByText('Delete camera'));
    expect(screen.getByText('Delete camera?')).toBeOnTheScreen();

    fireEvent.press(screen.getByText('Delete'));

    expect(mockDeleteMutate).toHaveBeenCalledWith(
      'cam-1',
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/cameras'));
  });

  it('shows a loading spinner in the snapshot card while waiting for the first frame', async () => {
    mockUseCameraQuery.mockReturnValue({
      data: {
        id: 'cam-1',
        name: 'Workbench Camera',
        description: null,
        status: { connection: 'online' },
      },
      isLoading: false,
      isError: false,
      error: null,
      refetch: mockRefetch,
      isFetching: false,
    });
    mockUseCameraPreview.mockReturnValue({ snapshotUrl: null, error: null });

    renderWithProviders(<CameraDetailScreen />);

    expect(await screen.findByText('Loading preview…')).toBeOnTheScreen();
  });

  it('renders the snapshot image when a frame is available', async () => {
    mockUseCameraQuery.mockReturnValue({
      data: {
        id: 'cam-1',
        name: 'Workbench Camera',
        description: null,
        status: { connection: 'online' },
      },
      isLoading: false,
      isError: false,
      error: null,
      refetch: mockRefetch,
      isFetching: false,
    });
    mockUseCameraPreview.mockReturnValue({ snapshotUrl: 'blob:snapshot-frame', error: null });

    renderWithProviders(<CameraDetailScreen />);

    expect(await screen.findByText('img:blob:snapshot-frame')).toBeOnTheScreen();
  });

  it('shows the camera URL row for direct-http cameras', async () => {
    mockUseCameraQuery.mockReturnValue({
      data: {
        id: 'cam-1',
        name: 'HTTP Camera',
        description: null,
        status: { connection: 'offline' },
      },
      isLoading: false,
      isError: false,
      error: null,
      refetch: mockRefetch,
      isFetching: false,
    });
    mockUseCameraPreview.mockReturnValue({ snapshotUrl: null, error: null });

    renderWithProviders(<CameraDetailScreen />);

    expect(await screen.findByText('http://camera.local:8018')).toBeOnTheScreen();
    expect(screen.getAllByText('Direct HTTP').length).toBeGreaterThan(0);
  });
});
