import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { useRouter } from 'expo-router';
import AddCameraScreen from '@/app/(tabs)/(cameras)/cameras/add';
import { renderWithProviders } from '@/test-utils/index';

const mockUseAuth = jest.fn();
const mockUseClaimPairingMutation = jest.fn();

jest.mock('@/context/auth', () => ({
  useAuth: () => mockUseAuth(),
}));

jest.mock('@/features/cameras/rpi/hooks', () => ({
  useClaimPairingMutation: () => mockUseClaimPairingMutation(),
  useCamerasQuery: jest.fn(),
  useCaptureAllMutation: jest.fn(),
}));

describe('AddCameraScreen', () => {
  const mockPush = jest.fn();
  const mockReplace = jest.fn();
  const claimMutate = jest.fn<(body: unknown) => Promise<unknown>>();

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

    claimMutate.mockResolvedValue({});
    mockUseClaimPairingMutation.mockReturnValue({
      mutateAsync: claimMutate,
      isPending: false,
    });
  });

  it('submits the pairing flow with sanitized uppercase codes', async () => {
    await renderWithProviders(<AddCameraScreen />, { withDialog: true });

    const pairingCodeInput = screen.getByLabelText('Pairing code');
    const cameraNameInput = screen.getByLabelText('Camera name, required');
    const descriptionInput = screen.getByLabelText('Description (optional)');
    await fireEvent.changeText(pairingCodeInput, 'ab-12cd9');
    await fireEvent.changeText(cameraNameInput, 'Workbench Camera');
    await fireEvent.changeText(descriptionInput, 'Bench setup');

    await fireEvent.press(screen.getByText('Pair camera'));

    await waitFor(() =>
      expect(claimMutate).toHaveBeenCalledWith({
        code: 'AB12CD',
        camera_name: 'Workbench Camera',
        description: 'Bench setup',
      }),
    );
  });

  it('sends one claim when Pair camera is pressed twice quickly', async () => {
    let release: () => void = () => {};
    claimMutate.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = () => resolve({});
        }),
    );
    await renderWithProviders(<AddCameraScreen />, { withDialog: true });

    await fireEvent.changeText(screen.getByLabelText('Pairing code'), 'AB12CD');
    await fireEvent.changeText(screen.getByLabelText('Camera name, required'), 'Test Camera');
    const pair = screen.getByText('Pair camera');
    await act(async () => {
      fireEvent.press(pair);
      fireEvent.press(pair);
    });

    await waitFor(() => expect(claimMutate).toHaveBeenCalledTimes(1));
    await act(async () => {
      release();
    });
    expect(claimMutate).toHaveBeenCalledTimes(1);
  });

  it('alerts on pairing error', async () => {
    claimMutate.mockRejectedValue(new Error('pairing failed'));
    await renderWithProviders(<AddCameraScreen />, { withDialog: true });

    const pairingCodeInput = screen.getByLabelText('Pairing code');
    const cameraNameInput = screen.getByLabelText('Camera name, required');
    await fireEvent.changeText(pairingCodeInput, 'AB12CD');
    await fireEvent.changeText(cameraNameInput, 'Test Camera');
    await fireEvent.press(screen.getByText('Pair camera'));

    expect(await screen.findByText('pairing failed')).toBeOnTheScreen();
  });

  it('dismisses the pairing success dialog and navigates to the camera list', async () => {
    await renderWithProviders(<AddCameraScreen />, { withDialog: true });

    const pairingCodeInput = screen.getByLabelText('Pairing code');
    const cameraNameInput = screen.getByLabelText('Camera name, required');
    await fireEvent.changeText(pairingCodeInput, 'AB12CD');
    await fireEvent.changeText(cameraNameInput, 'Test Camera');
    await fireEvent.press(screen.getByText('Pair camera'));

    expect(await screen.findByText('Camera paired')).toBeOnTheScreen();

    await fireEvent.press(screen.getByText('Done'));

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/cameras'));
  });

  it('redirects unauthenticated users to login', async () => {
    mockUseAuth.mockReturnValue({ user: undefined });

    await renderWithProviders(<AddCameraScreen />, { withDialog: true });

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith({
        pathname: '/login',
        params: { redirectTo: '/cameras' },
      });
    });
  });
});
