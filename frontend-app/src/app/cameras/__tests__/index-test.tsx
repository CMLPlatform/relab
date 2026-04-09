import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { useRouter } from 'expo-router';
import { renderWithProviders } from '@/test-utils';
import CamerasScreen from '../index';

const mockUseAuth = jest.fn();
const mockUseCamerasQuery = jest.fn();

jest.mock('@/context/AuthProvider', () => ({
  useAuth: () => mockUseAuth(),
}));

jest.mock('@/hooks/useRpiCameras', () => ({
  useCamerasQuery: (...args: unknown[]) => mockUseCamerasQuery(...args),
}));

describe('CamerasScreen', () => {
  const mockPush = jest.fn();
  const mockReplace = jest.fn();
  const mockRefetch = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (useRouter as jest.Mock).mockReturnValue({
      push: mockPush,
      replace: mockReplace,
      back: jest.fn(),
      setParams: jest.fn(),
      dismissTo: jest.fn(),
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
  });

  it('shows an empty state and lets the user navigate to add a camera', () => {
    renderWithProviders(<CamerasScreen />);

    expect(screen.getByText('No cameras yet')).toBeOnTheScreen();
    expect(screen.getByText('Tap the + button to register your first RPi camera.')).toBeOnTheScreen();

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
          connection_mode: 'websocket',
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
    expect(screen.getByText('WebSocket')).toBeOnTheScreen();
    expect(screen.getByText('Online')).toBeOnTheScreen();

    fireEvent.press(screen.getByLabelText('Camera: Workbench Camera'));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/cameras/[id]',
      params: { id: 'cam-1' },
    });
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
});
