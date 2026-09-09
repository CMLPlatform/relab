import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import CamerasScreen from '@/app/(tabs)/(cameras)/cameras/index';
import { getHostByType, renderWithProviders } from '@/test-utils/index';

const SELECTED_PATTERN = /selected/;

const mockUseAuth = jest.fn();
const mockUseCamerasQuery = jest.fn();
const mockUseLocalConnection = jest.fn();
const mockCaptureMutate = jest.fn();
const mockUseBreakpoint = jest.fn(() => ({ isMd: false, isLg: false }));

jest.mock('@/context/auth', () => ({
  useAuth: () => mockUseAuth(),
}));

jest.mock('@/features/cameras/rpi/hooks', () => ({
  useCamerasQuery: (...args: unknown[]) => mockUseCamerasQuery(...args),
  useCaptureAllMutation: () => ({
    mutate: mockCaptureMutate,
    isPending: false,
  }),
}));

jest.mock('@/features/cameras/local-connection/useLocalConnection', () => ({
  useLocalConnection: (...args: unknown[]) => mockUseLocalConnection(...args),
}));

jest.mock('@/hooks/useBreakpoint', () => ({
  useBreakpoint: () => mockUseBreakpoint(),
}));

jest.mock('@/components/base/CenteredSpinner', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    CenteredSpinner: () => React.createElement(View, { testID: 'cameras-loading-state' }),
  };
});

jest.mock('@/components/base/ErrorState', () => {
  const React = require('react');
  const { Pressable, Text, View } = require('react-native');
  return {
    ErrorState: ({ message, onRetry }: { message: string; onRetry: () => void }) =>
      React.createElement(
        View,
        null,
        React.createElement(Text, null, message),
        React.createElement(
          Pressable,
          { accessibilityRole: 'button', onPress: onRetry },
          React.createElement(Text, null, 'Retry'),
        ),
      ),
  };
});

jest.mock('@/components/cameras/GoLiveDialog', () => ({
  GoLiveDialog: () => null,
}));

describe('CamerasScreen', () => {
  const mockPush = jest.fn();
  const mockReplace = jest.fn();
  const mockRefetch = jest.fn();
  const mockSetOptions = jest.fn();

  const camerasQuery = (over: Record<string, unknown> = {}) => ({
    data: [],
    isLoading: false,
    isFetching: false,
    isError: false,
    error: null,
    refetch: mockRefetch,
    ...over,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    (useRouter as jest.Mock).mockReturnValue({
      push: mockPush,
      replace: mockReplace,
      back: jest.fn(),
      setParams: jest.fn(),
      dismissTo: jest.fn(),
    });
    (useNavigation as jest.Mock).mockReturnValue({
      setOptions: mockSetOptions,
    });
    mockUseAuth.mockReturnValue({
      user: { id: 'user-1', email: 'test@example.com' },
    });
    mockUseCamerasQuery.mockReturnValue(camerasQuery());
    mockUseLocalConnection.mockReturnValue({
      mode: 'relay',
      localBaseUrl: null,
    });
    mockUseBreakpoint.mockReturnValue({ isMd: false, isLg: false });
  });

  it('shows an empty state and lets the user navigate to add a camera', async () => {
    await renderWithProviders(<CamerasScreen />, { withDialog: true });

    expect(screen.getByText('No cameras yet')).toBeOnTheScreen();
    expect(screen.getByText('Tap Add camera to register your first RPi camera.')).toBeOnTheScreen();
    expect(mockSetOptions).toHaveBeenCalled();
    expect(mockSetOptions.mock.calls[0][0]).toEqual(
      expect.objectContaining({ title: 'My cameras' }),
    );

    await fireEvent.press(screen.getByLabelText('Add camera'));

    expect(mockPush).toHaveBeenCalledWith('/cameras/add');
  });

  it('renders camera cards and navigates to the detail screen', async () => {
    mockUseCamerasQuery.mockReturnValue(
      camerasQuery({
        data: [
          {
            id: 'cam-1',
            name: 'Workbench Camera',
            description: 'Bench setup',
            status: { connection: 'online' },
          },
        ],
      }),
    );

    await renderWithProviders(<CamerasScreen />, { withDialog: true });

    expect(screen.getByText('Workbench Camera')).toBeOnTheScreen();
    expect(screen.getByText('Online')).toBeOnTheScreen();

    await fireEvent.press(screen.getByLabelText('Camera: Workbench Camera'));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/cameras/[id]',
      params: { id: 'cam-1' },
    });
  });

  it('treats a locally reachable camera as online even when relay status is offline', async () => {
    mockUseCamerasQuery.mockReturnValue(
      camerasQuery({
        data: [
          {
            id: 'cam-1',
            name: 'Direct Camera',
            description: 'Ethernet setup',
            status: { connection: 'offline', last_seen_at: null, details: null },
          },
        ],
      }),
    );
    mockUseLocalConnection.mockReturnValue({
      mode: 'local',
      localBaseUrl: 'http://192.168.7.1:8018',
    });

    await renderWithProviders(<CamerasScreen />, { withDialog: true });

    expect(screen.getByText('Direct Camera')).toBeOnTheScreen();
    expect(screen.getByText('Online')).toBeOnTheScreen();
    expect(screen.getByText('Direct connection')).toBeOnTheScreen();
    expect(screen.queryByText('Offline')).toBeNull();
  });

  it('shows an error state and retries loading', async () => {
    mockUseCamerasQuery.mockReturnValue(
      camerasQuery({
        data: undefined,
        isError: true,
        error: new Error('Broken camera list'),
      }),
    );

    await renderWithProviders(<CamerasScreen />, { withDialog: true });

    expect(screen.getByText('Broken camera list')).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Retry'));

    await waitFor(() => expect(mockRefetch).toHaveBeenCalled());
  });

  it('shows loading spinner and no camera list when isLoading is true', async () => {
    mockUseCamerasQuery.mockReturnValue(
      camerasQuery({
        data: undefined,
        isLoading: true,
      }),
    );
    await renderWithProviders(<CamerasScreen />, { withDialog: true });
    // Loading state renders an ActivityIndicator; no list or empty-state text
    expect(screen.queryByText('No cameras yet')).toBeNull();
    expect(screen.queryByText('Retry')).toBeNull();
  });

  it('parses array product param and enables capture mode', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ product: ['42'] });
    mockUseCamerasQuery.mockReturnValue(
      camerasQuery({
        data: [{ id: 'cam-1', name: 'Cam', description: '', status: { connection: 'online' } }],
      }),
    );

    await renderWithProviders(<CamerasScreen />, { withDialog: true });

    // Long-press a camera in capture mode → enters selection mode → SelectionBar appears
    await fireEvent(screen.getByLabelText('Camera: Cam'), 'longPress');
    expect(screen.getByText('1 selected')).toBeOnTheScreen();
  });

  it('does not enable capture mode for non-numeric product param', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ product: 'not-a-number' });
    mockUseCamerasQuery.mockReturnValue(
      camerasQuery({
        data: [{ id: 'cam-1', name: 'Cam', description: '', status: { connection: 'online' } }],
      }),
    );

    await renderWithProviders(<CamerasScreen />, { withDialog: true });

    // Long-press should not enter selection mode (captureModeEnabled=false)
    await fireEvent(screen.getByLabelText('Camera: Cam'), 'longPress');
    expect(screen.queryByText(SELECTED_PATTERN)).toBeNull();
  });

  it('shows success snackbar after capture with no failures', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ product: '7' });
    mockUseCamerasQuery.mockReturnValue(
      camerasQuery({
        data: [{ id: 'cam-1', name: 'Cam', description: '', status: { connection: 'online' } }],
      }),
    );
    mockCaptureMutate.mockImplementation((...args: unknown[]) => {
      const opts = args[1] as {
        onSuccess: (r: { total: number; succeeded: number; failed: number }) => void;
      };
      opts.onSuccess({ total: 2, succeeded: 2, failed: 0 });
    });

    await renderWithProviders(<CamerasScreen />, { withDialog: true });
    await fireEvent(screen.getByLabelText('Camera: Cam'), 'longPress');
    expect(screen.getByText('1 selected')).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Capture 1'));

    expect(screen.getByText('Captured 2/2 cameras')).toBeOnTheScreen();
  });

  it('shows partial-failure snackbar when some captures fail', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ product: '7' });
    mockUseCamerasQuery.mockReturnValue(
      camerasQuery({
        data: [{ id: 'cam-1', name: 'Cam', description: '', status: { connection: 'online' } }],
      }),
    );
    mockCaptureMutate.mockImplementation((...args: unknown[]) => {
      const opts = args[1] as {
        onSuccess: (r: { total: number; succeeded: number; failed: number }) => void;
      };
      opts.onSuccess({ total: 3, succeeded: 2, failed: 1 });
    });

    await renderWithProviders(<CamerasScreen />, { withDialog: true });
    await fireEvent(screen.getByLabelText('Camera: Cam'), 'longPress');
    expect(screen.getByText('1 selected')).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Capture 1'));

    expect(screen.getByText('Captured 2/3 · 1 failed')).toBeOnTheScreen();
  });

  it('shows error snackbar on capture mutation error', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ product: '7' });
    mockUseCamerasQuery.mockReturnValue(
      camerasQuery({
        data: [{ id: 'cam-1', name: 'Cam', description: '', status: { connection: 'online' } }],
      }),
    );
    mockCaptureMutate.mockImplementation((...args: unknown[]) => {
      const opts = args[1] as { onError: (err: Error) => void };
      opts.onError(new Error('timeout'));
    });

    await renderWithProviders(<CamerasScreen />, { withDialog: true });
    await fireEvent(screen.getByLabelText('Camera: Cam'), 'longPress');
    expect(screen.getByText('1 selected')).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Capture 1'));

    expect(
      screen.getByText('Capture failed — check the cameras are online and try again.'),
    ).toBeOnTheScreen();
  });

  it('redirects unauthenticated users to login', async () => {
    mockUseAuth.mockReturnValue({ user: undefined });

    await renderWithProviders(<CamerasScreen />, { withDialog: true });

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith({
        pathname: '/login',
        params: { redirectTo: '/cameras' },
      });
    });
  });

  // ── Selection-mode behaviour ───────────────────────────────────────────────

  it('long-press on an online card WITHOUT ?product param does not enter selection mode', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({});
    mockUseCamerasQuery.mockReturnValue(
      camerasQuery({
        data: [{ id: 'cam-1', name: 'Cam', description: '', status: { connection: 'online' } }],
      }),
    );

    await renderWithProviders(<CamerasScreen />, { withDialog: true });

    await fireEvent(screen.getByLabelText('Camera: Cam'), 'longPress');

    expect(screen.queryByText(SELECTED_PATTERN)).toBeNull();
  });

  it('long-press in selection mode toggles the camera id in selectedIds', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ product: '7' });
    mockUseCamerasQuery.mockReturnValue(
      camerasQuery({
        data: [
          { id: 'cam-1', name: 'Cam A', description: '', status: { connection: 'online' } },
          { id: 'cam-2', name: 'Cam B', description: '', status: { connection: 'online' } },
        ],
      }),
    );

    await renderWithProviders(<CamerasScreen />, { withDialog: true });

    // Enter selection mode with cam-1
    await fireEvent(screen.getByLabelText('Camera: Cam A'), 'longPress');
    expect(screen.getByText('1 selected')).toBeOnTheScreen();

    // Long-press cam-2 to add it → 2 selected
    await fireEvent(screen.getByLabelText('Camera: Cam B'), 'longPress');
    expect(screen.getByText('2 selected')).toBeOnTheScreen();

    // Long-press cam-1 again to deselect → 1 selected
    await fireEvent(screen.getByLabelText('Camera: Cam A'), 'longPress');
    expect(screen.getByText('1 selected')).toBeOnTheScreen();
  });

  it('long-pressing an offline camera in capture mode shows snackbar and does not toggle', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ product: '7' });
    mockUseCamerasQuery.mockReturnValue(
      camerasQuery({
        data: [
          { id: 'cam-1', name: 'Online Cam', description: '', status: { connection: 'online' } },
          { id: 'cam-2', name: 'Offline Cam', description: '', status: { connection: 'offline' } },
        ],
      }),
    );

    await renderWithProviders(<CamerasScreen />, { withDialog: true });

    // Long-press the offline camera directly: shows snackbar without entering selection mode
    await fireEvent(screen.getByLabelText('Camera: Offline Cam'), 'longPress');

    await waitFor(() =>
      expect(screen.getByText("Offline Cam is offline — can't capture.")).toBeOnTheScreen(),
    );
    // Selection mode must NOT have been entered
    expect(screen.queryByText(SELECTED_PATTERN)).toBeNull();
  });

  it('"Select all" fills selectedIds with exactly the online cameras', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ product: '7' });
    mockUseCamerasQuery.mockReturnValue(
      camerasQuery({
        data: [
          { id: 'cam-1', name: 'Cam A', description: '', status: { connection: 'online' } },
          { id: 'cam-2', name: 'Cam B', description: '', status: { connection: 'online' } },
          { id: 'cam-3', name: 'Cam C', description: '', status: { connection: 'offline' } },
        ],
      }),
    );

    await renderWithProviders(<CamerasScreen />, { withDialog: true });

    // Enter selection mode
    await fireEvent(screen.getByLabelText('Camera: Cam A'), 'longPress');
    expect(screen.getByText('1 selected')).toBeOnTheScreen();

    // Press "Select all (2)": 2 online cameras
    await fireEvent.press(screen.getByLabelText('Select all online cameras'));

    expect(screen.getByText('2 selected')).toBeOnTheScreen();
  });

  it('"Capture N" fires useCaptureAllMutation with selected ids + productId and clears selection on success', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ product: '7' });
    mockUseCamerasQuery.mockReturnValue(
      camerasQuery({
        data: [{ id: 'cam-1', name: 'Cam', description: '', status: { connection: 'online' } }],
      }),
    );
    mockCaptureMutate.mockImplementation((...args: unknown[]) => {
      const opts = args[1] as {
        onSuccess: (r: { total: number; succeeded: number; failed: number }) => void;
      };
      opts.onSuccess({ total: 1, succeeded: 1, failed: 0 });
    });

    await renderWithProviders(<CamerasScreen />, { withDialog: true });

    await fireEvent(screen.getByLabelText('Camera: Cam'), 'longPress');
    expect(screen.getByText('1 selected')).toBeOnTheScreen();

    await fireEvent.press(screen.getByText('Capture 1'));

    await waitFor(() => {
      expect(mockCaptureMutate).toHaveBeenCalledWith(
        { cameraIds: ['cam-1'], productId: 7 },
        expect.any(Object),
      );
    });

    // Selection is cleared after success
    expect(screen.queryByText(SELECTED_PATTERN)).toBeNull();
  });

  // ── Pull-to-refresh ────────────────────────────────────────────────────────

  it('pull-to-refresh calls refetch()', async () => {
    mockUseCamerasQuery.mockReturnValue(camerasQuery());

    await renderWithProviders(<CamerasScreen />, { withDialog: true });

    // RefreshControl's props stay on the element the list holds: the host it
    // renders carries only children, so there is no handler to fire on.
    const list = getHostByType('RCTScrollView');
    const { refreshControl } = list.props as {
      refreshControl: { props: { onRefresh: () => void } };
    };
    await act(async () => {
      refreshControl.props.onRefresh();
    });

    await waitFor(() => expect(mockRefetch).toHaveBeenCalled());
  });

  // ── Column layout ──────────────────────────────────────────────────────────

  // The column count itself is covered by getCameraGridColumns' own tests:
  // `numColumns` is consumed by FlatList and never reaches a host element, so
  // there is nothing left to assert on at this level.
});
