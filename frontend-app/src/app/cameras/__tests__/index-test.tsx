import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { renderWithProviders } from '@/test-utils/index';
import CamerasScreen from '../index';

const SELECTED_PATTERN = /selected/;

const mockUseAuth = jest.fn();
const mockUseCamerasQuery = jest.fn();
const mockUseLocalConnection = jest.fn();
const mockCaptureMutate = jest.fn();
const mockUseIsDesktop = jest.fn<() => boolean>(() => false);

jest.mock('@/context/auth', () => ({
  useAuth: () => mockUseAuth(),
}));

jest.mock('@/hooks/useRpiCameras', () => ({
  useCamerasQuery: (...args: unknown[]) => mockUseCamerasQuery(...args),
  useCaptureAllMutation: () => ({
    mutate: mockCaptureMutate,
    isPending: false,
  }),
}));

jest.mock('@/hooks/useLocalConnection', () => ({
  useLocalConnection: (...args: unknown[]) => mockUseLocalConnection(...args),
}));

jest.mock('@/hooks/useIsDesktop', () => ({
  useIsDesktop: () => mockUseIsDesktop(),
}));

jest.mock('@/components/cameras/screen/States', () => {
  const React = require('react');
  const { Pressable, Text, View } = require('react-native');

  return {
    CamerasLoadingState: () => React.createElement(View, { testID: 'cameras-loading-state' }),
    CamerasErrorState: ({
      message,
      onRetry,
    }: {
      message: string;
      onRetry: () => void;
    }) =>
      React.createElement(
        View,
        null,
        React.createElement(Text, null, message),
        React.createElement(Pressable, { accessibilityRole: 'button', onPress: onRetry }, React.createElement(Text, null, 'Retry')),
      ),
  };
});

jest.mock('@/components/cameras/screen/Chrome', () => {
  const React = require('react');
  const { Pressable, Text, View } = require('react-native');

  return {
    CamerasFab: ({ visible, onPress }: { visible: boolean; onPress: () => void }) =>
      visible
        ? React.createElement(
            Pressable,
            { accessibilityLabel: 'Add camera', accessibilityRole: 'button', onPress },
            React.createElement(Text, null, 'Add camera'),
          )
        : null,
    CamerasSelectionOverlay: ({
      visible,
      selectedCount,
      onlineCount,
      onSelectAll,
      onClear,
      onCaptureAll,
    }: {
      visible: boolean;
      selectedCount: number;
      onlineCount: number;
      onSelectAll: () => void;
      onClear: () => void;
      onCaptureAll: () => void;
    }) =>
      visible
        ? React.createElement(
            View,
            null,
            React.createElement(Text, null, `${selectedCount} selected`),
            React.createElement(
              Pressable,
              { accessibilityLabel: 'Select all online cameras', accessibilityRole: 'button', onPress: onSelectAll },
              React.createElement(Text, null, `Select all (${onlineCount})`),
            ),
            React.createElement(
              Pressable,
              { accessibilityRole: 'button', onPress: onCaptureAll },
              React.createElement(Text, null, `Capture ${selectedCount}`),
            ),
            React.createElement(
              Pressable,
              { accessibilityRole: 'button', onPress: onClear },
              React.createElement(Text, null, 'Clear'),
            ),
          )
        : null,
    CamerasSnackbar: ({
      message,
      onDismiss,
    }: {
      message: string | null;
      onDismiss: () => void;
    }) =>
      message
        ? React.createElement(
            Pressable,
            { accessibilityRole: 'button', onPress: onDismiss },
            React.createElement(Text, null, message),
          )
        : null,
    CamerasStreamDialog: () => null,
  };
});

jest.mock('@/components/cameras/screen/Grid', () => {
  const React = require('react');
  const { Pressable, Text, View } = require('react-native');

  return {
    CamerasGrid: ({
      rows,
      numColumns,
      onRefresh,
      onCardPress,
      onCardLongPress,
      onEffectiveConnectionChange,
    }: {
      rows: Array<{
        id: string;
        name: string;
        description?: string;
        status?: { connection?: string | null };
      }>;
      numColumns: number;
      onRefresh: () => void;
      onCardPress: (row: unknown) => void;
      onCardLongPress: (row: unknown) => void;
      onEffectiveConnectionChange: (cameraId: string, next: unknown) => void;
    }) =>
      React.createElement(
        View,
        { numColumns, refreshing: false, onRefresh },
        rows.length === 0
          ? React.createElement(
              View,
              null,
              React.createElement(Text, null, 'No cameras yet'),
              React.createElement(Text, null, 'Tap the + button to register your first RPi camera.'),
            )
          : rows.map((row) =>
              {
                const localConnection = mockUseLocalConnection();
                const isLocallyReachable =
                  localConnection?.mode === 'local' && Boolean(localConnection?.localBaseUrl);
                const statusLabel =
                  isLocallyReachable || row.status?.connection === 'online' ? 'Online' : 'Offline';
                const subtitle = isLocallyReachable ? 'Direct connection' : row.description;

                return React.createElement(
                  Pressable,
                  {
                    key: row.id,
                    accessibilityLabel: `Camera: ${row.name}`,
                    accessibilityRole: 'button',
                    onPress: () => onCardPress(row),
                    onLongPress: () => onCardLongPress(row),
                  },
                  React.createElement(Text, null, row.name),
                  React.createElement(Text, null, statusLabel),
                  subtitle ? React.createElement(Text, null, subtitle) : null,
                  React.createElement(
                    Pressable,
                    {
                      accessibilityLabel: `Mark ${row.name} reachable`,
                      accessibilityRole: 'button',
                      onPress: () =>
                        onEffectiveConnectionChange(row.id, {
                          isReachable: true,
                          mode: 'local',
                          localBaseUrl: 'http://192.168.7.1:8018',
                        }),
                    },
                    React.createElement(Text, null, 'Mark reachable'),
                  ),
                );
              }
            ),
      ),
  };
});

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: this screen suite intentionally keeps one shared mocked cameras environment.
describe('CamerasScreen', () => {
  const mockPush = jest.fn();
  const mockReplace = jest.fn();
  const mockRefetch = jest.fn();
  const mockSetOptions = jest.fn();

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
    mockUseCamerasQuery.mockReturnValue({
      data: [],
      isLoading: false,
      isFetching: false,
      isError: false,
      error: null,
      refetch: mockRefetch,
    });
    mockUseLocalConnection.mockReturnValue({
      mode: 'relay',
      localBaseUrl: null,
    });
    mockUseIsDesktop.mockReturnValue(false);
  });

  it('shows an empty state and lets the user navigate to add a camera', () => {
    renderWithProviders(<CamerasScreen />);

    expect(screen.getByText('No cameras yet')).toBeOnTheScreen();
    expect(
      screen.getByText('Tap the + button to register your first RPi camera.'),
    ).toBeOnTheScreen();
    expect(mockSetOptions).toHaveBeenCalled();
    expect(mockSetOptions.mock.calls[0][0]).toEqual(
      expect.objectContaining({ title: 'My Cameras' }),
    );

    fireEvent.press(screen.getByLabelText('Add camera'));

    expect(mockPush).toHaveBeenCalledWith('/cameras/add');
  });

  it('renders camera cards and navigates to the detail screen', () => {
    mockUseCamerasQuery.mockReturnValue({
      data: [
        {
          id: 'cam-1',
          name: 'Workbench Camera',
          description: 'Bench setup',
          status: { connection: 'online' },
        },
      ],
      isLoading: false,
      isFetching: false,
      isError: false,
      error: null,
      refetch: mockRefetch,
    });

    renderWithProviders(<CamerasScreen />);

    expect(screen.getByText('Workbench Camera')).toBeOnTheScreen();
    expect(screen.getByText('Workbench Camera')).toBeOnTheScreen();
    expect(screen.getByText('Online')).toBeOnTheScreen();

    fireEvent.press(screen.getByLabelText('Camera: Workbench Camera'));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/cameras/[id]',
      params: { id: 'cam-1' },
    });
  });

  it('treats a locally reachable camera as online even when relay status is offline', () => {
    mockUseCamerasQuery.mockReturnValue({
      data: [
        {
          id: 'cam-1',
          name: 'Direct Camera',
          description: 'Ethernet setup',
          status: { connection: 'offline', last_seen_at: null, details: null },
        },
      ],
      isLoading: false,
      isFetching: false,
      isError: false,
      error: null,
      refetch: mockRefetch,
    });
    mockUseLocalConnection.mockReturnValue({
      mode: 'local',
      localBaseUrl: 'http://192.168.7.1:8018',
    });

    renderWithProviders(<CamerasScreen />);

    expect(screen.getByText('Direct Camera')).toBeOnTheScreen();
    expect(screen.getByText('Online')).toBeOnTheScreen();
    expect(screen.getByText('Direct connection')).toBeOnTheScreen();
    expect(screen.queryByText('Offline')).toBeNull();
  });

  it('shows an error state and retries loading', async () => {
    mockUseCamerasQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      isFetching: false,
      isError: true,
      error: new Error('Broken camera list'),
      refetch: mockRefetch,
    });

    renderWithProviders(<CamerasScreen />);

    expect(screen.getByText('Error: Broken camera list')).toBeOnTheScreen();
    fireEvent.press(screen.getByText('Retry'));

    await waitFor(() => expect(mockRefetch).toHaveBeenCalled());
  });

  it('shows loading spinner and no camera list when isLoading is true', () => {
    mockUseCamerasQuery.mockReturnValue({
      data: undefined,
      isLoading: true,
      isFetching: false,
      isError: false,
      error: null,
      refetch: mockRefetch,
    });
    renderWithProviders(<CamerasScreen />);
    // Loading state renders an ActivityIndicator; no list or empty-state text
    expect(screen.queryByText('No cameras yet')).toBeNull();
    expect(screen.queryByText('Retry')).toBeNull();
  });

  it('parses array product param and enables capture mode', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ product: ['42'] });
    mockUseCamerasQuery.mockReturnValue({
      data: [{ id: 'cam-1', name: 'Cam', description: '', status: { connection: 'online' } }],
      isLoading: false,
      isFetching: false,
      isError: false,
      error: null,
      refetch: mockRefetch,
    });

    renderWithProviders(<CamerasScreen />);

    // Long-press a camera in capture mode → enters selection mode → SelectionBar appears
    fireEvent(screen.getByLabelText('Camera: Cam'), 'longPress');
    expect(screen.getByText('1 selected')).toBeOnTheScreen();
  });

  it('does not enable capture mode for non-numeric product param', () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ product: 'not-a-number' });
    mockUseCamerasQuery.mockReturnValue({
      data: [{ id: 'cam-1', name: 'Cam', description: '', status: { connection: 'online' } }],
      isLoading: false,
      isFetching: false,
      isError: false,
      error: null,
      refetch: mockRefetch,
    });

    renderWithProviders(<CamerasScreen />);

    // Long-press should not enter selection mode (captureModeEnabled=false)
    fireEvent(screen.getByLabelText('Camera: Cam'), 'longPress');
    expect(screen.queryByText(SELECTED_PATTERN)).toBeNull();
  });

  it('shows success snackbar after capture with no failures', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ product: '7' });
    mockUseCamerasQuery.mockReturnValue({
      data: [{ id: 'cam-1', name: 'Cam', description: '', status: { connection: 'online' } }],
      isLoading: false,
      isFetching: false,
      isError: false,
      error: null,
      refetch: mockRefetch,
    });
    mockCaptureMutate.mockImplementation((...args: unknown[]) => {
      const opts = args[1] as {
        onSuccess: (r: { total: number; succeeded: number; failed: number }) => void;
      };
      opts.onSuccess({ total: 2, succeeded: 2, failed: 0 });
    });

    renderWithProviders(<CamerasScreen />);
    fireEvent(screen.getByLabelText('Camera: Cam'), 'longPress');
    expect(screen.getByText('1 selected')).toBeOnTheScreen();
    fireEvent.press(screen.getByText('Capture 1'));

    expect(screen.getByText('Captured 2/2 cameras')).toBeOnTheScreen();
  });

  it('shows partial-failure snackbar when some captures fail', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ product: '7' });
    mockUseCamerasQuery.mockReturnValue({
      data: [{ id: 'cam-1', name: 'Cam', description: '', status: { connection: 'online' } }],
      isLoading: false,
      isFetching: false,
      isError: false,
      error: null,
      refetch: mockRefetch,
    });
    mockCaptureMutate.mockImplementation((...args: unknown[]) => {
      const opts = args[1] as {
        onSuccess: (r: { total: number; succeeded: number; failed: number }) => void;
      };
      opts.onSuccess({ total: 3, succeeded: 2, failed: 1 });
    });

    renderWithProviders(<CamerasScreen />);
    fireEvent(screen.getByLabelText('Camera: Cam'), 'longPress');
    expect(screen.getByText('1 selected')).toBeOnTheScreen();
    fireEvent.press(screen.getByText('Capture 1'));

    expect(screen.getByText('Captured 2/3 · 1 failed')).toBeOnTheScreen();
  });

  it('shows error snackbar on capture mutation error', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ product: '7' });
    mockUseCamerasQuery.mockReturnValue({
      data: [{ id: 'cam-1', name: 'Cam', description: '', status: { connection: 'online' } }],
      isLoading: false,
      isFetching: false,
      isError: false,
      error: null,
      refetch: mockRefetch,
    });
    mockCaptureMutate.mockImplementation((...args: unknown[]) => {
      const opts = args[1] as { onError: (err: Error) => void };
      opts.onError(new Error('timeout'));
    });

    renderWithProviders(<CamerasScreen />);
    fireEvent(screen.getByLabelText('Camera: Cam'), 'longPress');
    expect(screen.getByText('1 selected')).toBeOnTheScreen();
    fireEvent.press(screen.getByText('Capture 1'));

    expect(screen.getByText('Capture failed: Error: timeout')).toBeOnTheScreen();
  });

  it('redirects unauthenticated users to login', async () => {
    mockUseAuth.mockReturnValue({ user: undefined });

    renderWithProviders(<CamerasScreen />);

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith({
        pathname: '/login',
        params: { redirectTo: '/cameras' },
      });
    });
  });

  // ── Selection-mode behaviour ───────────────────────────────────────────────

  it('long-press on an online card WITHOUT ?product param does not enter selection mode', () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({});
    mockUseCamerasQuery.mockReturnValue({
      data: [{ id: 'cam-1', name: 'Cam', description: '', status: { connection: 'online' } }],
      isLoading: false,
      isFetching: false,
      isError: false,
      error: null,
      refetch: mockRefetch,
    });

    renderWithProviders(<CamerasScreen />);

    fireEvent(screen.getByLabelText('Camera: Cam'), 'longPress');

    expect(screen.queryByText(SELECTED_PATTERN)).toBeNull();
  });

  it('long-press in selection mode toggles the camera id in selectedIds', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ product: '7' });
    mockUseCamerasQuery.mockReturnValue({
      data: [
        { id: 'cam-1', name: 'Cam A', description: '', status: { connection: 'online' } },
        { id: 'cam-2', name: 'Cam B', description: '', status: { connection: 'online' } },
      ],
      isLoading: false,
      isFetching: false,
      isError: false,
      error: null,
      refetch: mockRefetch,
    });

    renderWithProviders(<CamerasScreen />);

    // Enter selection mode with cam-1
    fireEvent(screen.getByLabelText('Camera: Cam A'), 'longPress');
    expect(screen.getByText('1 selected')).toBeOnTheScreen();

    // Long-press cam-2 to add it → 2 selected
    fireEvent(screen.getByLabelText('Camera: Cam B'), 'longPress');
    expect(screen.getByText('2 selected')).toBeOnTheScreen();

    // Long-press cam-1 again to deselect → 1 selected
    fireEvent(screen.getByLabelText('Camera: Cam A'), 'longPress');
    expect(screen.getByText('1 selected')).toBeOnTheScreen();
  });

  it('long-pressing an offline camera in capture mode shows snackbar and does not toggle', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ product: '7' });
    mockUseCamerasQuery.mockReturnValue({
      data: [
        { id: 'cam-1', name: 'Online Cam', description: '', status: { connection: 'online' } },
        { id: 'cam-2', name: 'Offline Cam', description: '', status: { connection: 'offline' } },
      ],
      isLoading: false,
      isFetching: false,
      isError: false,
      error: null,
      refetch: mockRefetch,
    });

    renderWithProviders(<CamerasScreen />);

    // Long-press the offline camera directly — shows snackbar without entering selection mode
    fireEvent(screen.getByLabelText('Camera: Offline Cam'), 'longPress');

    await waitFor(() =>
      expect(screen.getByText("Offline Cam is offline — can't capture.")).toBeOnTheScreen(),
    );
    // Selection mode must NOT have been entered
    expect(screen.queryByText(SELECTED_PATTERN)).toBeNull();
  });

  it('"Select all" fills selectedIds with exactly the online cameras', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ product: '7' });
    mockUseCamerasQuery.mockReturnValue({
      data: [
        { id: 'cam-1', name: 'Cam A', description: '', status: { connection: 'online' } },
        { id: 'cam-2', name: 'Cam B', description: '', status: { connection: 'online' } },
        { id: 'cam-3', name: 'Cam C', description: '', status: { connection: 'offline' } },
      ],
      isLoading: false,
      isFetching: false,
      isError: false,
      error: null,
      refetch: mockRefetch,
    });

    renderWithProviders(<CamerasScreen />);

    // Enter selection mode
    fireEvent(screen.getByLabelText('Camera: Cam A'), 'longPress');
    expect(screen.getByText('1 selected')).toBeOnTheScreen();

    // Press "Select all (2)" — 2 online cameras
    fireEvent.press(screen.getByLabelText('Select all online cameras'));

    expect(screen.getByText('2 selected')).toBeOnTheScreen();
  });

  it('"Capture N" fires useCaptureAllMutation with selected ids + productId and clears selection on success', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ product: '7' });
    mockUseCamerasQuery.mockReturnValue({
      data: [{ id: 'cam-1', name: 'Cam', description: '', status: { connection: 'online' } }],
      isLoading: false,
      isFetching: false,
      isError: false,
      error: null,
      refetch: mockRefetch,
    });
    mockCaptureMutate.mockImplementation((...args: unknown[]) => {
      const opts = args[1] as {
        onSuccess: (r: { total: number; succeeded: number; failed: number }) => void;
      };
      opts.onSuccess({ total: 1, succeeded: 1, failed: 0 });
    });

    renderWithProviders(<CamerasScreen />);

    fireEvent(screen.getByLabelText('Camera: Cam'), 'longPress');
    expect(screen.getByText('1 selected')).toBeOnTheScreen();

    fireEvent.press(screen.getByText('Capture 1'));

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
    mockUseCamerasQuery.mockReturnValue({
      data: [],
      isLoading: false,
      isFetching: false,
      isError: false,
      error: null,
      refetch: mockRefetch,
    });

    const { UNSAFE_getByProps } = renderWithProviders(<CamerasScreen />);

    // The FlatList RefreshControl fires onRefresh when pulled
    const refreshControl = UNSAFE_getByProps({ refreshing: false });
    fireEvent(refreshControl, 'refresh');

    await waitFor(() => expect(mockRefetch).toHaveBeenCalled());
  });

  // ── Column layout ──────────────────────────────────────────────────────────

  it('desktop layout uses 3 columns', () => {
    mockUseIsDesktop.mockReturnValue(true);
    mockUseCamerasQuery.mockReturnValue({
      data: [],
      isLoading: false,
      isFetching: false,
      isError: false,
      error: null,
      refetch: mockRefetch,
    });

    const { UNSAFE_getByProps } = renderWithProviders(<CamerasScreen />);

    const list = UNSAFE_getByProps({ numColumns: 3 });
    expect(list).toBeTruthy();
  });

  it('mobile layout uses 2 columns', () => {
    mockUseIsDesktop.mockReturnValue(false);
    mockUseCamerasQuery.mockReturnValue({
      data: [],
      isLoading: false,
      isFetching: false,
      isError: false,
      error: null,
      refetch: mockRefetch,
    });

    const { UNSAFE_getByProps } = renderWithProviders(<CamerasScreen />);

    const list = UNSAFE_getByProps({ numColumns: 2 });
    expect(list).toBeTruthy();
  });
});
