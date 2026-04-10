import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type React from 'react';
import {
  CameraSnapshotError,
  captureImageFromCamera,
  claimPairingCode,
  createCamera,
  deleteCamera,
  fetchCamera,
  fetchCameraSnapshot,
  fetchCameras,
  regenerateCameraApiKey,
  updateCamera,
} from '@/services/api/rpiCamera';
import {
  cameraQueryOptions,
  camerasQueryOptions,
  useCameraPreview,
  useCameraQuery,
  useCamerasQuery,
  useCaptureImageMutation,
  useClaimPairingMutation,
  useCreateCameraMutation,
  useDeleteCameraMutation,
  useRegenerateApiKeyMutation,
  useUpdateCameraMutation,
} from '../useRpiCameras';

jest.mock('@/services/api/rpiCamera', () => ({
  CameraSnapshotError: class CameraSnapshotError extends Error {
    status: number;

    constructor(status: number, message: string) {
      super(message);
      this.name = 'CameraSnapshotError';
      this.status = status;
    }
  },
  fetchCameraSnapshot: jest.fn(),
  fetchCameras: jest.fn(),
  fetchCamera: jest.fn(),
  createCamera: jest.fn(),
  updateCamera: jest.fn(),
  deleteCamera: jest.fn(),
  regenerateCameraApiKey: jest.fn(),
  claimPairingCode: jest.fn(),
  captureImageFromCamera: jest.fn(),
}));

const mockedFetchCameraSnapshot = jest.mocked(fetchCameraSnapshot);
const mockedFetchCameras = jest.mocked(fetchCameras);
const mockedFetchCamera = jest.mocked(fetchCamera);
const mockedCreateCamera = jest.mocked(createCamera);
const mockedUpdateCamera = jest.mocked(updateCamera);
const mockedDeleteCamera = jest.mocked(deleteCamera);
const mockedRegenerateCameraApiKey = jest.mocked(regenerateCameraApiKey);
const mockedClaimPairingCode = jest.mocked(claimPairingCode);
const mockedCaptureImageFromCamera = jest.mocked(captureImageFromCamera);

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
});

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
);

describe('useCameraPreview', () => {
  const createObjectUrlSpy = jest.spyOn(URL, 'createObjectURL');
  const revokeObjectUrlSpy = jest.spyOn(URL, 'revokeObjectURL');

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    queryClient.clear();
    createObjectUrlSpy.mockImplementation((blob: Blob | MediaSource) => `blob:${String(blob)}`);
    revokeObjectUrlSpy.mockImplementation(() => undefined);
    global.requestAnimationFrame = jest.fn((callback: FrameRequestCallback) => {
      callback(0);
      return 0;
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('polls snapshot previews and revokes the previous blob URL when a new frame arrives', async () => {
    mockedFetchCameraSnapshot
      .mockResolvedValueOnce('blob:first-frame')
      .mockResolvedValueOnce('blob:second-frame');

    const { result, unmount } = renderHook(
      () => useCameraPreview({ id: 'cam-1' }, { enabled: true, intervalMs: 100 }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.snapshotUrl).toBe('blob:first-frame'));
    expect(result.current.error).toBeNull();

    await act(async () => {
      jest.advanceTimersByTime(100);
    });

    await waitFor(() => expect(result.current.snapshotUrl).toBe('blob:second-frame'));
    expect(revokeObjectUrlSpy).toHaveBeenCalledWith('blob:first-frame');

    unmount();
    expect(revokeObjectUrlSpy).toHaveBeenCalledWith('blob:second-frame');
  });

  it('waits for the current snapshot request to finish before scheduling the next poll', async () => {
    let resolveFirstSnapshot: ((value: string) => void) | null = null;
    mockedFetchCameraSnapshot.mockImplementationOnce(
      () =>
        new Promise<string>((resolve) => {
          resolveFirstSnapshot = resolve;
        }),
    );

    renderHook(() => useCameraPreview({ id: 'cam-10' }, { enabled: true, intervalMs: 100 }), {
      wrapper,
    });

    expect(mockedFetchCameraSnapshot).toHaveBeenCalledTimes(1);

    await act(async () => {
      jest.advanceTimersByTime(500);
    });

    expect(mockedFetchCameraSnapshot).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveFirstSnapshot?.('blob:resolved-frame');
    });

    await act(async () => {
      jest.advanceTimersByTime(100);
    });

    await waitFor(() => expect(mockedFetchCameraSnapshot).toHaveBeenCalledTimes(2));
  });

  it('backs off snapshot polling after service-unavailable responses', async () => {
    mockedFetchCameraSnapshot
      .mockRejectedValueOnce(new CameraSnapshotError(503, 'Failed to fetch snapshot (503)'))
      .mockResolvedValueOnce('blob:recovered-frame');

    const { result } = renderHook(
      () => useCameraPreview({ id: 'cam-11' }, { enabled: true, intervalMs: 100 }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.error?.message).toBe('Failed to fetch snapshot (503)'));
    expect(mockedFetchCameraSnapshot).toHaveBeenCalledTimes(1);

    await act(async () => {
      jest.advanceTimersByTime(100);
    });
    expect(mockedFetchCameraSnapshot).toHaveBeenCalledTimes(1);

    await act(async () => {
      jest.advanceTimersByTime(100);
    });

    await waitFor(() => expect(result.current.snapshotUrl).toBe('blob:recovered-frame'));
    expect(result.current.error).toBeNull();
    expect(mockedFetchCameraSnapshot).toHaveBeenCalledTimes(2);
  });

  it('surfaces CameraSnapshotError instances directly for streaming conflicts', async () => {
    mockedFetchCameraSnapshot.mockRejectedValueOnce(
      new CameraSnapshotError(409, 'Snapshot preview unavailable while the camera is streaming.'),
    );

    const { result } = renderHook(
      () => useCameraPreview({ id: 'cam-2' }, { enabled: true, intervalMs: 100 }),
      { wrapper },
    );

    await waitFor(() =>
      expect(result.current.error?.message).toBe(
        'Snapshot preview unavailable while the camera is streaming.',
      ),
    );
    expect(result.current.snapshotUrl).toBeNull();
  });

  it('wraps unexpected snapshot errors in a generic Error instance', async () => {
    mockedFetchCameraSnapshot.mockRejectedValueOnce('unexpected snapshot failure');

    const { result } = renderHook(
      () => useCameraPreview({ id: 'cam-4' }, { enabled: true, intervalMs: 100 }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.error?.message).toBe('unexpected snapshot failure'));
    expect(result.current.snapshotUrl).toBeNull();
  });

  it('surfaces a native Error instance directly without wrapping', async () => {
    mockedFetchCameraSnapshot.mockRejectedValueOnce(new Error('network timeout'));

    const { result } = renderHook(
      () => useCameraPreview({ id: 'cam-5' }, { enabled: true, intervalMs: 100 }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.error?.message).toBe('network timeout'));
    expect(result.current.snapshotUrl).toBeNull();
  });

  it('clears preview state when disabled', async () => {
    mockedFetchCameraSnapshot.mockResolvedValueOnce('blob:frame');

    const { result, rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) =>
        useCameraPreview({ id: 'cam-3' }, { enabled, intervalMs: 100 }),
      {
        wrapper,
        initialProps: { enabled: true },
      },
    );

    await waitFor(() => expect(result.current.snapshotUrl).toBe('blob:frame'));

    rerender({ enabled: false });

    await waitFor(() => {
      expect(result.current.snapshotUrl).toBeNull();
      expect(result.current.error).toBeNull();
    });
  });

  it('does not fetch when no camera id is available', () => {
    const { result } = renderHook(
      () => useCameraPreview(null, { enabled: true, intervalMs: 100 }),
      { wrapper },
    );

    expect(result.current.snapshotUrl).toBeNull();
    expect(result.current.error).toBeNull();
    expect(mockedFetchCameraSnapshot).not.toHaveBeenCalled();
  });
});

describe('RPi camera query hooks', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    queryClient.clear();
  });

  it('builds camera query options with the expected query keys and stale times', async () => {
    mockedFetchCameras.mockResolvedValue([]);
    mockedFetchCamera.mockResolvedValue({ id: 'cam-1', name: 'Workbench Camera' });

    expect(camerasQueryOptions(true).queryKey).toEqual(['rpiCameras', true]);
    expect(camerasQueryOptions(false).staleTime).toBe(60_000);
    expect(cameraQueryOptions('cam-1', true).queryKey).toEqual(['rpiCamera', 'cam-1', true]);
    expect(cameraQueryOptions('cam-1', true).staleTime).toBe(15_000);

    await camerasQueryOptions(true).queryFn();
    await cameraQueryOptions('cam-1', true).queryFn();

    expect(mockedFetchCameras).toHaveBeenCalledWith(true);
    expect(mockedFetchCamera).toHaveBeenCalledWith('cam-1', true);
  });

  it('defaults includeStatus to false and uses the longer stale time when the flag is omitted', async () => {
    mockedFetchCameras.mockResolvedValue([]);
    mockedFetchCamera.mockResolvedValue({ id: 'cam-1', name: 'Workbench Camera' });

    expect(camerasQueryOptions().queryKey).toEqual(['rpiCameras', false]);
    expect(camerasQueryOptions().staleTime).toBe(60_000);
    expect(camerasQueryOptions(true).staleTime).toBe(15_000);

    expect(cameraQueryOptions('cam-1').queryKey).toEqual(['rpiCamera', 'cam-1', false]);
    expect(cameraQueryOptions('cam-1').staleTime).toBe(60_000);
    expect(cameraQueryOptions('cam-1', true).staleTime).toBe(15_000);

    await camerasQueryOptions().queryFn();
    await cameraQueryOptions('cam-1').queryFn();

    expect(mockedFetchCameras).toHaveBeenCalledWith(false);
    expect(mockedFetchCamera).toHaveBeenCalledWith('cam-1', false);
  });

  it('runs useCamerasQuery when enabled and skips it when disabled', async () => {
    mockedFetchCameras.mockResolvedValue([{ id: 'cam-1', name: 'Workbench Camera' }]);

    const { result, rerender, unmount } = renderHook(
      ({ enabled }: { enabled: boolean }) => useCamerasQuery(true, { enabled }),
      {
        wrapper,
        initialProps: { enabled: false },
      },
    );

    expect(result.current.fetchStatus).toBe('idle');
    expect(mockedFetchCameras).not.toHaveBeenCalled();

    await act(async () => {
      rerender({ enabled: true });
    });

    await waitFor(() => expect(mockedFetchCameras).toHaveBeenCalledWith(true));
    unmount();
  });

  it('runs useCameraQuery only when a camera id is present', async () => {
    mockedFetchCamera.mockResolvedValue({ id: 'cam-2', name: 'Close-up Camera' });

    const { result, rerender, unmount } = renderHook(
      ({ id }: { id: string }) => useCameraQuery(id, true),
      {
        wrapper,
        initialProps: { id: '' },
      },
    );

    expect(result.current.fetchStatus).toBe('idle');
    expect(mockedFetchCamera).not.toHaveBeenCalled();

    await act(async () => {
      rerender({ id: 'cam-2' });
    });

    await waitFor(() => expect(mockedFetchCamera).toHaveBeenCalledWith('cam-2', true));
    unmount();
  });
});

describe('RPi camera mutation hooks', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    queryClient.clear();
  });

  it('invalidates the camera list after creating a camera', async () => {
    mockedCreateCamera.mockResolvedValue({ id: 'cam-1', name: 'Workbench Camera' });
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useCreateCameraMutation(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        name: 'Workbench Camera',
        connection_mode: 'websocket',
      });
    });

    expect(mockedCreateCamera).toHaveBeenCalledWith({
      name: 'Workbench Camera',
      connection_mode: 'websocket',
    });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['rpiCameras'] });
  });

  it('invalidates the camera detail and list after updating a camera', async () => {
    mockedUpdateCamera.mockResolvedValue({ id: 'cam-2', name: 'Updated Camera' });
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useUpdateCameraMutation('cam-2'), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ name: 'Updated Camera' });
    });

    expect(mockedUpdateCamera).toHaveBeenCalledWith('cam-2', { name: 'Updated Camera' });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['rpiCamera', 'cam-2'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['rpiCameras'] });
  });

  it('invalidates the camera list after deleting a camera or claiming pairing', async () => {
    mockedDeleteCamera.mockResolvedValue(undefined);
    mockedClaimPairingCode.mockResolvedValue({ id: 'cam-3', api_key: 'secret' });
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

    const { result: deleteResult } = renderHook(() => useDeleteCameraMutation(), { wrapper });
    const { result: claimResult } = renderHook(() => useClaimPairingMutation(), { wrapper });

    await act(async () => {
      await deleteResult.current.mutateAsync('cam-3');
      await claimResult.current.mutateAsync({
        code: 'ABC123',
        camera_name: 'Paired Camera',
      });
    });

    expect(mockedDeleteCamera).toHaveBeenCalledWith('cam-3');
    expect(mockedClaimPairingCode).toHaveBeenCalledWith({
      code: 'ABC123',
      camera_name: 'Paired Camera',
    });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['rpiCameras'] });
  });

  it('invalidates the camera detail after regenerating the API key', async () => {
    mockedRegenerateCameraApiKey.mockResolvedValue({ id: 'cam-4', api_key: 'new-secret' });
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useRegenerateApiKeyMutation('cam-4'), { wrapper });

    await act(async () => {
      await result.current.mutateAsync();
    });

    expect(mockedRegenerateCameraApiKey).toHaveBeenCalledWith('cam-4');
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['rpiCamera', 'cam-4'] });
  });

  it('invalidates the owning product after capturing a camera image', async () => {
    mockedCaptureImageFromCamera.mockResolvedValue({
      id: 'img-1',
      url: 'https://example.com/capture.jpg',
      description: 'Capture',
    });
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useCaptureImageMutation(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ cameraId: 'cam-5', productId: 42 });
    });

    expect(mockedCaptureImageFromCamera).toHaveBeenCalledWith('cam-5', 42);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['product', 42] });
  });
});
