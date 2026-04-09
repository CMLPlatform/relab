import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Camera, CameraView } from 'expo-camera';
import QrScanner, { requestCameraAccess } from '../QrScanner';
import { mockPlatform, restorePlatform } from '@/test-utils';

jest.mock('expo-camera', () => ({
  CameraView: jest.fn(() => null),
  Camera: {
    requestCameraPermissionsAsync: jest.fn(),
  },
}));

const mockedCameraView = jest.mocked(CameraView);
const mockedRequestPermissions = jest.mocked(Camera.requestCameraPermissionsAsync);

describe('QrScanner', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    restorePlatform();
  });

  it('returns null when not visible', () => {
    const { toJSON } = render(
      <QrScanner visible={false} onScanned={jest.fn()} onClose={jest.fn()} />,
    );

    expect(toJSON()).toBeNull();
  });

  it('parses relab pairing QR payloads and closes after a valid scan', () => {
    const onScanned = jest.fn();
    const onClose = jest.fn();

    render(<QrScanner visible onScanned={onScanned} onClose={onClose} />);

    const lastCall = mockedCameraView.mock.calls.at(-1);
    expect(lastCall).toBeDefined();
    const props = lastCall?.[0] as { onBarcodeScanned?: (event: { data: string }) => void };
    act(() => {
      props.onBarcodeScanned?.({ data: 'relab-pair:ab12cd' });
    });

    expect(onScanned).toHaveBeenCalledWith('AB12CD');
    expect(onClose).toHaveBeenCalled();
  });

  it('accepts raw 6-character codes and ignores invalid scans', () => {
    const onScanned = jest.fn();
    const onClose = jest.fn();

    render(<QrScanner visible onScanned={onScanned} onClose={onClose} />);

    const lastCall = mockedCameraView.mock.calls.at(-1);
    expect(lastCall).toBeDefined();
    const props = lastCall?.[0] as { onBarcodeScanned?: (event: { data: string }) => void };

    act(() => {
      props.onBarcodeScanned?.({ data: '  xyz789  ' });
    });
    act(() => {
      props.onBarcodeScanned?.({ data: 'not-a-valid-code' });
    });

    expect(onScanned).toHaveBeenCalledTimes(1);
    expect(onScanned).toHaveBeenCalledWith('XYZ789');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes when the close button is pressed', () => {
    const onClose = jest.fn();

    render(<QrScanner visible onScanned={jest.fn()} onClose={onClose} />);

    fireEvent.press(screen.getByLabelText('Close scanner'));

    expect(onClose).toHaveBeenCalled();
  });
});

describe('requestCameraAccess', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    restorePlatform();
  });

  it('requests browser camera access on web and stops acquired tracks', async () => {
    mockPlatform('web');
    const stop = jest.fn();
    const getUserMedia = jest.fn().mockResolvedValue({
      getTracks: () => [{ stop }],
    });
    Object.defineProperty(global, 'navigator', {
      configurable: true,
      value: { mediaDevices: { getUserMedia } },
    });

    await expect(requestCameraAccess()).resolves.toBe(true);
    expect(getUserMedia).toHaveBeenCalledWith({
      video: { facingMode: 'environment' },
    });
    expect(stop).toHaveBeenCalled();
  });

  it('returns false on web when getUserMedia is unavailable', async () => {
    mockPlatform('web');
    Object.defineProperty(global, 'navigator', {
      configurable: true,
      value: { mediaDevices: undefined },
    });

    await expect(requestCameraAccess()).resolves.toBe(false);
  });

  it('delegates to expo-camera permissions on native', async () => {
    mockPlatform('ios');
    mockedRequestPermissions.mockResolvedValue({ granted: true } as Awaited<
      ReturnType<typeof Camera.requestCameraPermissionsAsync>
    >);

    await expect(requestCameraAccess()).resolves.toBe(true);
    expect(mockedRequestPermissions).toHaveBeenCalled();
  });
});
