import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, screen } from '@testing-library/react-native';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { renderWithProviders } from '@/test-utils/index';
import CameraDetailScreen from '@/app/cameras/[id]';

const FAILED_TO_LOAD_CAMERA_PATTERN = /Failed to load camera/;

const mockUseAuth = jest.fn();
const mockUseCameraQuery = jest.fn();
const mockUseUpdateCameraMutation = jest.fn();
const mockUseDeleteCameraMutation = jest.fn();
const mockUseEffectiveCameraConnection = jest.fn();
const mockUpdateMutate = jest.fn();
const mockDeleteMutate = jest.fn<(_id: string, options?: { onSuccess?: () => void }) => void>();

jest.mock('expo-router', () => ({
  useLocalSearchParams: jest.fn(),
  useNavigation: jest.fn(),
  useRouter: jest.fn(),
}));

jest.mock('@/context/auth', () => ({
  useAuth: () => mockUseAuth(),
}));

jest.mock('@/hooks/useRpiCameras', () => ({
  useCameraQuery: (...args: unknown[]) => mockUseCameraQuery(...args),
  useUpdateCameraMutation: () => mockUseUpdateCameraMutation(),
  useDeleteCameraMutation: () => mockUseDeleteCameraMutation(),
}));

jest.mock('@/hooks/useEffectiveCameraConnection', () => ({
  useEffectiveCameraConnection: (...args: unknown[]) => mockUseEffectiveCameraConnection(...args),
}));

jest.mock('@/components/cameras/YouTubeStreamCard', () => ({
  YouTubeStreamCard: () => {
    const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
    const React = jest.requireActual<typeof import('react')>('react');
    return React.createElement(Text, null, 'youtube-stream-stub');
  },
}));

// LivePreview pulls in expo-video / hls.js — both noisy under jest-expo's
// transform pipeline. Stub the component out to a marker text so the screen
// renders without spinning up a real HLS player.
jest.mock('@/components/cameras/LivePreview', () => ({
  LivePreview: () => {
    const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
    const React = jest.requireActual<typeof import('react')>('react');
    return React.createElement(Text, null, 'live-preview-stub');
  },
}));

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: this integration-style suite shares one camera-detail harness and grouped flows.
describe('Camera detail screen', () => {
  const mockReplace = jest.fn();
  const mockNavigationSetOptions = jest.fn();
  const mockRefetch = jest.fn();
  const makeEffectiveConnection = (overrides: Record<string, unknown> = {}) => ({
    relayStatus: 'online',
    status: 'online',
    transport: 'relay',
    isReachable: true,
    canUseRelay: true,
    canUseDirect: false,
    detailLabel: null,
    localConnection: {
      mode: 'relay',
      localBaseUrl: null,
      localMediaUrl: null,
      localApiKey: null,
      configure: jest.fn(),
      clearLocalConnection: jest.fn(),
      isInitializing: false,
    },
    ...overrides,
  });

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
        relay_type: 'websocket',
        direct_url: null,
        status: { connection: 'online' },
      },
      isLoading: false,
      isError: false,
      error: null,
      refetch: mockRefetch,
      isFetching: false,
    });
    mockUseUpdateCameraMutation.mockReturnValue({ mutate: mockUpdateMutate, isPending: false });
    mockUseDeleteCameraMutation.mockReturnValue({ mutate: mockDeleteMutate, isPending: false });
    mockUseEffectiveCameraConnection.mockReturnValue(makeEffectiveConnection());
  });

  it('renders the live preview component for an online camera and sets the screen title', async () => {
    renderWithProviders(<CameraDetailScreen />);

    expect(screen.getByText('live-preview-stub')).toBeOnTheScreen();
    expect(mockNavigationSetOptions).toHaveBeenCalledWith({ title: 'Workbench Camera' });
  });

  it('can stop and restart the live preview without leaving the detail screen', async () => {
    renderWithProviders(<CameraDetailScreen />);

    expect(screen.getByText('live-preview-stub')).toBeOnTheScreen();

    fireEvent.press(screen.getByText('Stop Preview'));

    expect(screen.queryByText('live-preview-stub')).toBeNull();
    expect(screen.getByText('Load Preview')).toBeOnTheScreen();

    fireEvent.press(screen.getByText('Load Preview'));

    expect(screen.getByText('live-preview-stub')).toBeOnTheScreen();
  });

  it('shows websocket offline helper copy and supports retrying camera status', async () => {
    mockUseCameraQuery.mockReturnValue({
      data: {
        id: 'cam-1',
        name: 'Workbench Camera',
        description: null,
        relay_type: 'websocket',
        direct_url: null,
        status: { connection: 'offline' },
      },
      isLoading: false,
      isError: false,
      error: null,
      refetch: mockRefetch,
      isFetching: false,
    });
    mockUseEffectiveCameraConnection.mockReturnValue(
      makeEffectiveConnection({
        relayStatus: 'offline',
        status: 'offline',
        transport: 'unreachable',
        isReachable: false,
        canUseRelay: false,
      }),
    );
    renderWithProviders(<CameraDetailScreen />);

    expect(screen.getByText('Waiting for camera to connect via WebSocket relay')).toBeOnTheScreen();

    fireEvent.press(screen.getByLabelText('Refresh status'));

    expect(mockRefetch).toHaveBeenCalled();
  });

  it('opens the edit-name dialog and saves the trimmed camera name', async () => {
    renderWithProviders(<CameraDetailScreen />);

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
    mockUseEffectiveCameraConnection.mockReturnValue(
      makeEffectiveConnection({
        relayStatus: 'offline',
        status: 'offline',
        transport: 'unreachable',
        isReachable: false,
        canUseRelay: false,
      }),
    );

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
    mockUseEffectiveCameraConnection.mockReturnValue(
      makeEffectiveConnection({
        relayStatus: 'offline',
        status: 'offline',
        transport: 'unreachable',
        isReachable: false,
        canUseRelay: false,
      }),
    );

    renderWithProviders(<CameraDetailScreen />);

    expect(screen.getByText(FAILED_TO_LOAD_CAMERA_PATTERN)).toBeOnTheScreen();
    fireEvent.press(screen.getByText('Retry'));
    expect(mockRefetch).toHaveBeenCalled();
  });

  it('opens the edit-description dialog and saves the trimmed description', async () => {
    renderWithProviders(<CameraDetailScreen />);

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

  it('shows error view with Retry when data is undefined and isError is false', async () => {
    mockUseCameraQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
      error: null,
      refetch: mockRefetch,
      isFetching: false,
    });
    mockUseEffectiveCameraConnection.mockReturnValue(
      makeEffectiveConnection({
        relayStatus: 'offline',
        status: 'offline',
        transport: 'unreachable',
        isReachable: false,
        canUseRelay: false,
      }),
    );

    renderWithProviders(<CameraDetailScreen />);

    // String(null) = 'null' so the fallback text never shows, but the error
    // view branch (isError || !camera) is still entered — confirm via Retry.
    expect(screen.getByText('Retry')).toBeOnTheScreen();
    fireEvent.press(screen.getByText('Retry'));
    expect(mockRefetch).toHaveBeenCalled();
  });

  it('shows Offline label when camera status is null', async () => {
    mockUseCameraQuery.mockReturnValue({
      data: {
        id: 'cam-1',
        name: 'Workbench Camera',
        description: null,
        relay_type: 'websocket',
        direct_url: null,
        status: null,
      },
      isLoading: false,
      isError: false,
      error: null,
      refetch: mockRefetch,
      isFetching: false,
    });
    mockUseEffectiveCameraConnection.mockReturnValue(
      makeEffectiveConnection({
        relayStatus: 'offline',
        status: 'offline',
        transport: 'unreachable',
        isReachable: false,
        canUseRelay: false,
      }),
    );

    renderWithProviders(<CameraDetailScreen />);

    expect(screen.getAllByText('Offline').length).toBeGreaterThan(0);
  });

  it('dismisses the edit-name dialog when Cancel is pressed', async () => {
    renderWithProviders(<CameraDetailScreen />);

    fireEvent.press(screen.getByLabelText('Edit name'));
    expect(screen.getByText('Edit name')).toBeOnTheScreen();

    fireEvent.press(screen.getByText('Cancel'));

    expect(screen.queryByText('Edit name')).toBeNull();
  });

  it('dismisses the edit-description dialog when Cancel is pressed', async () => {
    renderWithProviders(<CameraDetailScreen />);

    fireEvent.press(screen.getByLabelText('Edit description'));
    expect(screen.getByText('Edit description')).toBeOnTheScreen();

    fireEvent.press(screen.getByText('Cancel'));

    expect(screen.queryByText('Edit description')).toBeNull();
  });

  it('dismisses the delete dialog when Cancel is pressed', async () => {
    renderWithProviders(<CameraDetailScreen />);

    fireEvent.press(screen.getByText('Delete camera'));
    expect(screen.getByText('Delete camera?')).toBeOnTheScreen();

    const cancelButtons = screen.getAllByText('Cancel');
    const cancelButton = cancelButtons[cancelButtons.length - 1];
    expect(cancelButton).toBeTruthy();
    if (!cancelButton) {
      throw new Error('Cancel button not found');
    }
    fireEvent.press(cancelButton);
    act(() => {
      jest.runOnlyPendingTimers();
    });

    expect(screen.queryByText('Cancel')).toBeNull();
    expect(mockDeleteMutate).not.toHaveBeenCalled();
  }, 15_000);

  it('opens the delete confirmation and navigates away after successful deletion', async () => {
    mockDeleteMutate.mockImplementationOnce((_id: string, options?: { onSuccess?: () => void }) => {
      options?.onSuccess?.();
    });

    renderWithProviders(<CameraDetailScreen />);

    fireEvent.press(screen.getByText('Delete camera'));
    expect(screen.getByText('Delete camera?')).toBeOnTheScreen();

    fireEvent.press(screen.getByText('Delete'));

    expect(mockDeleteMutate).toHaveBeenCalledWith(
      'cam-1',
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
    expect(mockReplace).toHaveBeenCalledWith('/cameras');
  });
});
