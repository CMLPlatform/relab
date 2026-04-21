import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { useRouter } from 'expo-router';
import { renderWithProviders } from '@/test-utils/index';
import AddCameraScreen from '../add';

const mockUseAuth = jest.fn();
const mockUseClaimPairingMutation = jest.fn();

jest.mock('@/context/auth', () => ({
  useAuth: () => mockUseAuth(),
}));

jest.mock('@/hooks/useRpiCameras', () => ({
  useClaimPairingMutation: () => mockUseClaimPairingMutation(),
  useCamerasQuery: jest.fn(),
  useCaptureAllMutation: jest.fn(),
}));

describe('AddCameraScreen', () => {
  const mockPush = jest.fn();
  const mockReplace = jest.fn();
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

  it('alerts on pairing error', async () => {
    renderWithProviders(<AddCameraScreen />);

    const [pairingCodeInput, cameraNameInput] = getOutlinedInputs();
    fireEvent.changeText(pairingCodeInput, 'AB12CD');
    fireEvent.changeText(cameraNameInput, 'Test Camera');
    fireEvent.press(screen.getByText('Pair camera'));

    const pairOnError = (
      claimMutate.mock.calls[0]?.[1] as { onError?: (err: unknown) => void } | undefined
    )?.onError;
    pairOnError?.(new Error('pairing failed'));
    expect(alertSpy).toHaveBeenCalledWith('Error: pairing failed');
  });

  it('dismisses the pairing success dialog and navigates to the camera list', async () => {
    renderWithProviders(<AddCameraScreen />);

    const [pairingCodeInput, cameraNameInput] = getOutlinedInputs();
    fireEvent.changeText(pairingCodeInput, 'AB12CD');
    fireEvent.changeText(cameraNameInput, 'Test Camera');
    fireEvent.press(screen.getByText('Pair camera'));

    const onSuccess = (claimMutate.mock.calls[0]?.[1] as { onSuccess?: () => void } | undefined)
      ?.onSuccess;
    await act(async () => {
      onSuccess?.();
    });

    expect(await screen.findByText('Camera paired')).toBeOnTheScreen();

    fireEvent.press(screen.getByText('Done'));

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/cameras'));
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
