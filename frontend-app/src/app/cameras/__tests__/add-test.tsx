import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { useRouter } from 'expo-router';
import { renderWithProviders } from '@/test-utils';
import AddCameraScreen from '../add';

const mockUseAuth = jest.fn();
const mockUseCreateCameraMutation = jest.fn();
const mockUseClaimPairingMutation = jest.fn();

jest.mock('@/context/AuthProvider', () => ({
  useAuth: () => mockUseAuth(),
}));

jest.mock('@/hooks/useRpiCameras', () => ({
  useCreateCameraMutation: () => mockUseCreateCameraMutation(),
  useClaimPairingMutation: () => mockUseClaimPairingMutation(),
}));

describe('AddCameraScreen', () => {
  const mockPush = jest.fn();
  const mockReplace = jest.fn();
  const createMutate = jest.fn();
  const claimMutate = jest.fn();
  const alertSpy = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    Object.defineProperty(global, 'alert', {
      configurable: true,
      value: alertSpy,
    });
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
    mockUseCreateCameraMutation.mockReturnValue({
      mutate: createMutate,
      isPending: false,
    });
    mockUseClaimPairingMutation.mockReturnValue({
      mutate: claimMutate,
      isPending: false,
    });
  });

  function getOutlinedInputs() {
    return screen.getAllByTestId('text-input-outlined');
  }

  it('submits the pairing flow with sanitized uppercase codes', async () => {
    renderWithProviders(<AddCameraScreen />);

    const [pairingCodeInput, cameraNameInput, descriptionInput] = getOutlinedInputs();
    fireEvent.changeText(pairingCodeInput, 'ab-12cd9');
    fireEvent.changeText(cameraNameInput, 'Workbench Camera');
    fireEvent.changeText(descriptionInput, 'Bench setup');

    fireEvent.press(screen.getByText('Pair camera'));

    expect(claimMutate).toHaveBeenCalledWith(
      {
        code: 'AB12CD',
        camera_name: 'Workbench Camera',
        description: 'Bench setup',
      },
      expect.objectContaining({
        onSuccess: expect.any(Function),
        onError: expect.any(Function),
      }),
    );
  });

  it('supports manual websocket setup and shows returned credentials', async () => {
    renderWithProviders(<AddCameraScreen />);

    fireEvent.press(screen.getByText('Manual setup instead'));
    const [cameraNameInput] = getOutlinedInputs();
    fireEvent.changeText(cameraNameInput, 'Relay Camera');

    fireEvent.press(screen.getByText('Register camera'));

    expect(createMutate).toHaveBeenCalledWith(
      {
        name: 'Relay Camera',
        description: null,
        connection_mode: 'websocket',
        url: null,
      },
      expect.objectContaining({
        onSuccess: expect.any(Function),
        onError: expect.any(Function),
      }),
    );

    const onSuccess = createMutate.mock.calls[0]?.[1]?.onSuccess as ((camera: unknown) => void) | undefined;
    expect(onSuccess).toBeDefined();
    await act(async () => {
      onSuccess?.({
        id: 'cam-1',
        api_key: 'secret-key',
        connection_mode: 'websocket',
      });
    });

    expect(await screen.findByText('Camera registered')).toBeOnTheScreen();
    expect(screen.getByText(/relay_credentials\.json/)).toBeOnTheScreen();
  });

  it('shows the HTTP URL field and submits direct-http camera creation', () => {
    renderWithProviders(<AddCameraScreen />);

    fireEvent.press(screen.getByText('Direct HTTP (legacy)'));
    const [cameraNameInput, _descriptionInput, cameraUrlInput] = getOutlinedInputs();
    fireEvent.changeText(cameraNameInput, 'HTTP Camera');
    fireEvent.changeText(cameraUrlInput, 'http://camera.local:8018');

    fireEvent.press(screen.getByText('Register camera'));

    expect(createMutate).toHaveBeenCalledWith(
      {
        name: 'HTTP Camera',
        description: null,
        connection_mode: 'http',
        url: 'http://camera.local:8018',
      },
      expect.any(Object),
    );
  });

  it('alerts on pairing error and alerts on manual create error', async () => {
    renderWithProviders(<AddCameraScreen />);

    const [pairingCodeInput, cameraNameInput] = getOutlinedInputs();
    fireEvent.changeText(pairingCodeInput, 'AB12CD');
    fireEvent.changeText(cameraNameInput, 'Test Camera');
    fireEvent.press(screen.getByText('Pair camera'));

    const pairOnError = claimMutate.mock.calls[0]?.[1]?.onError as ((err: unknown) => void) | undefined;
    pairOnError?.(new Error('pairing failed'));
    expect(alertSpy).toHaveBeenCalledWith('Error: pairing failed');

    alertSpy.mockClear();

    fireEvent.press(screen.getByText('Manual setup instead'));
    fireEvent.press(screen.getByText('Register camera'));

    const createOnError = createMutate.mock.calls[0]?.[1]?.onError as ((err: unknown) => void) | undefined;
    createOnError?.(new Error('create failed'));
    expect(alertSpy).toHaveBeenCalledWith('Error: create failed');
  });

  it('dismisses the credentials dialog and navigates to the camera list', async () => {
    renderWithProviders(<AddCameraScreen />);

    fireEvent.press(screen.getByText('Manual setup instead'));
    const [cameraNameInput] = getOutlinedInputs();
    fireEvent.changeText(cameraNameInput, 'Relay Camera');
    fireEvent.press(screen.getByText('Register camera'));

    const onSuccess = createMutate.mock.calls[0]?.[1]?.onSuccess as ((camera: unknown) => void) | undefined;
    await act(async () => {
      onSuccess?.({ id: 'cam-1', api_key: 'secret-key', connection_mode: 'websocket' });
    });

    expect(await screen.findByText('Camera registered')).toBeOnTheScreen();

    fireEvent.press(screen.getByText('Done'));

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/cameras'));
  });

  it('dismisses the pairing success dialog and navigates to the camera list', async () => {
    renderWithProviders(<AddCameraScreen />);

    const [pairingCodeInput, cameraNameInput] = getOutlinedInputs();
    fireEvent.changeText(pairingCodeInput, 'AB12CD');
    fireEvent.changeText(cameraNameInput, 'Test Camera');
    fireEvent.press(screen.getByText('Pair camera'));

    const onSuccess = claimMutate.mock.calls[0]?.[1]?.onSuccess as (() => void) | undefined;
    await act(async () => {
      onSuccess?.();
    });

    expect(await screen.findByText('Camera paired')).toBeOnTheScreen();

    fireEvent.press(screen.getByText('Done'));

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/cameras'));
  });

  it('resets to pairing mode when switching back to WebSocket after using HTTP', () => {
    renderWithProviders(<AddCameraScreen />);

    fireEvent.press(screen.getByText('Direct HTTP (legacy)'));
    expect(screen.getByText('Register camera')).toBeOnTheScreen();

    fireEvent.press(screen.getByText('WebSocket'));
    expect(screen.getByText('Pair camera')).toBeOnTheScreen();
    expect(screen.queryByText('Camera URL *')).toBeNull();
  });

  it('redirects unauthenticated users to login', async () => {
    mockUseAuth.mockReturnValue({ user: undefined });

    renderWithProviders(<AddCameraScreen />);

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith({
        pathname: '/login',
        params: { redirectTo: '/cameras' },
      });
    });
  });
});
