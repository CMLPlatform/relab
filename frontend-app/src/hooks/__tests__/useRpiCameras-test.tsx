import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type React from 'react';
import {
  captureImageFromCamera,
  claimPairingCode,
  deleteCamera,
  fetchCamera,
  fetchCameraSnapshot,
  fetchCameraSnapshotLocally,
  fetchCameras,
  updateCamera,
} from '@/services/api/rpiCamera';
import {
  cameraQueryOptions,
  camerasQueryOptions,
  useCameraLivePreview,
  useCameraQuery,
  useCameraSnapshotQuery,
  useCamerasQuery,
  useCameraTelemetryQuery,
  useCaptureImageMutation,
  useClaimPairingMutation,
  useDeleteCameraMutation,
  useUpdateCameraMutation,
} from '../useRpiCameras';

jest.mock('@/services/api/rpiCamera', () => ({
  fetchCameras: jest.fn(),
  fetchCamera: jest.fn(),
  fetchCameraTelemetry: jest.fn(),
  fetchCameraSnapshot: jest.fn(),
  fetchCameraSnapshotLocally: jest.fn(),
  updateCamera: jest.fn(),
  deleteCamera: jest.fn(),
  claimPairingCode: jest.fn(),
  captureImageFromCamera: jest.fn(),
  buildCameraHlsUrl: (id: string) => `/api/rpi-cameras/${id}/hls/cam-preview/index.m3u8`,
}));

const mockedFetchCameras = jest.mocked(fetchCameras);
const mockedFetchCamera = jest.mocked(fetchCamera);
const mockedFetchCameraSnapshot = jest.mocked(fetchCameraSnapshot);
const mockedFetchCameraSnapshotLocally = jest.mocked(fetchCameraSnapshotLocally);
const mockedUpdateCamera = jest.mocked(updateCamera);
const mockedDeleteCamera = jest.mocked(deleteCamera);
const mockedClaimPairingCode = jest.mocked(claimPairingCode);
const mockedCaptureImageFromCamera = jest.mocked(captureImageFromCamera);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false, gcTime: 0 },
    mutations: { retry: false, gcTime: 0 },
  },
});

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
);

describe('RPi camera query hooks', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    queryClient.clear();
  });

  it('builds camera query options with the expected query keys and stale times', async () => {
    mockedFetchCameras.mockResolvedValue([
      {
        id: 'cam-1',
        name: 'Workbench Camera',
        description: null,
        owner_id: '1',
        relay_key_id: 'x',
        relay_credential_status: 'active',
        created_at: '',
        updated_at: '',
        status: { connection: 'online', details: null, last_seen_at: null },
      },
    ]);
    mockedFetchCamera.mockResolvedValue({
      id: 'cam-1',
      name: 'Workbench Camera',
      description: null,
      owner_id: '1',
      relay_key_id: 'x',
      relay_credential_status: 'active',
      created_at: '',
      updated_at: '',
      status: { connection: 'online', details: null, last_seen_at: null },
    });

    expect(camerasQueryOptions(true).queryKey).toEqual(['rpiCameras', true, false]);
    expect(camerasQueryOptions(false).staleTime).toBe(60_000);
    expect(cameraQueryOptions('cam-1', true).queryKey).toEqual(['rpiCamera', 'cam-1', true, false]);
    expect(cameraQueryOptions('cam-1', true).staleTime).toBe(15_000);

    await camerasQueryOptions(true).queryFn?.({} as never);
    await cameraQueryOptions('cam-1', true).queryFn?.({} as never);

    expect(mockedFetchCameras).toHaveBeenCalledWith(true, { includeTelemetry: false });
    expect(mockedFetchCamera).toHaveBeenCalledWith('cam-1', true, { includeTelemetry: false });
  });

  it('defaults includeStatus to false and uses the longer stale time when the flag is omitted', async () => {
    mockedFetchCameras.mockResolvedValue([]);
    mockedFetchCamera.mockResolvedValue({
      id: 'cam-1',
      name: 'Workbench Camera',
      description: null,
      owner_id: '1',
      relay_key_id: 'x',
      relay_credential_status: 'active',
      created_at: '',
      updated_at: '',
      status: { connection: 'online', details: null, last_seen_at: null },
    });

    expect(camerasQueryOptions().queryKey).toEqual(['rpiCameras', false, false]);
    expect(camerasQueryOptions().staleTime).toBe(60_000);
    expect(camerasQueryOptions(true).staleTime).toBe(15_000);

    expect(cameraQueryOptions('cam-1').queryKey).toEqual(['rpiCamera', 'cam-1', false, false]);
    expect(cameraQueryOptions('cam-1').staleTime).toBe(60_000);
    expect(cameraQueryOptions('cam-1', true).staleTime).toBe(15_000);

    await camerasQueryOptions().queryFn?.({} as never);
    await cameraQueryOptions('cam-1').queryFn?.({} as never);

    expect(mockedFetchCameras).toHaveBeenCalledWith(false, { includeTelemetry: false });
    expect(mockedFetchCamera).toHaveBeenCalledWith('cam-1', false, { includeTelemetry: false });
  });

  it('runs useCamerasQuery when enabled and skips it when disabled', async () => {
    mockedFetchCameras.mockResolvedValue([
      {
        id: 'cam-1',
        name: 'Workbench Camera',
        description: null,
        owner_id: '1',
        relay_key_id: 'x',
        relay_credential_status: 'active',
        created_at: '',
        updated_at: '',
        status: { connection: 'online', details: null, last_seen_at: null },
      },
    ]);

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

    await waitFor(() =>
      expect(mockedFetchCameras).toHaveBeenCalledWith(true, { includeTelemetry: false }),
    );
    act(() => {
      unmount();
    });
  });

  it('runs useCameraQuery only when a camera id is present', async () => {
    mockedFetchCamera.mockResolvedValue({
      id: 'cam-2',
      name: 'Close-up Camera',
      description: null,
      owner_id: '1',
      relay_key_id: 'x',
      relay_credential_status: 'active',
      created_at: '',
      updated_at: '',
      status: { connection: 'online', details: null, last_seen_at: null },
    });

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

    await waitFor(() =>
      expect(mockedFetchCamera).toHaveBeenCalledWith('cam-2', true, { includeTelemetry: false }),
    );
    act(() => {
      unmount();
    });
  });
});

describe('useCameraSnapshotQuery', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    queryClient.clear();
  });

  it('fetches a snapshot when the camera is online and caches the data URI', async () => {
    mockedFetchCameraSnapshot.mockResolvedValue('data:image/jpeg;base64,c2hvdA==');

    const { result } = renderHook(
      () => useCameraSnapshotQuery('cam-10', { enabled: true, refetchInterval: 60_000 }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.data).toBe('data:image/jpeg;base64,c2hvdA=='));
    expect(mockedFetchCameraSnapshot).toHaveBeenCalledWith('cam-10', expect.any(Object));
  });

  it('fetches snapshots directly from the Pi when local connection info is available', async () => {
    mockedFetchCameraSnapshotLocally.mockResolvedValue('data:image/jpeg;base64,bG9jYWw=');

    const { result } = renderHook(
      () =>
        useCameraSnapshotQuery('cam-local', {
          enabled: true,
          connectionInfo: {
            mode: 'local',
            localBaseUrl: 'http://192.168.7.1:8018',
            localMediaUrl: 'http://192.168.7.1:8888',
            localApiKey: 'local-key',
          },
        }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.data).toBe('data:image/jpeg;base64,bG9jYWw='));
    expect(mockedFetchCameraSnapshotLocally).toHaveBeenCalledWith(
      'http://192.168.7.1:8018',
      'local-key',
      expect.any(Object),
    );
    expect(mockedFetchCameraSnapshot).not.toHaveBeenCalled();
  });

  it('stays idle when disabled or when the camera id is missing', () => {
    const { result: disabledResult } = renderHook(
      () => useCameraSnapshotQuery('cam-11', { enabled: false }),
      { wrapper },
    );
    expect(disabledResult.current.fetchStatus).toBe('idle');

    const { result: missingResult } = renderHook(() => useCameraSnapshotQuery(null), { wrapper });
    expect(missingResult.current.fetchStatus).toBe('idle');
  });
});

describe('RPi camera mutation hooks', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    queryClient.clear();
  });

  it('invalidates the camera detail and list after updating a camera', async () => {
    mockedUpdateCamera.mockResolvedValue({
      id: 'cam-2',
      name: 'Updated Camera',
      description: null,
      owner_id: '1',
      relay_key_id: 'x',
      relay_credential_status: 'active',
      created_at: '',
      updated_at: '',
    });
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
    mockedClaimPairingCode.mockResolvedValue({
      id: 'cam-3',
      name: 'Camera',
      description: null,
      owner_id: '1',
      relay_key_id: 'x',
      relay_credential_status: 'active',
      created_at: '',
      updated_at: '',
    });
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

  it('stays idle and never fetches when cameraId is null', () => {
    const { result, unmount } = renderHook(() => useCameraTelemetryQuery(null), { wrapper });

    expect(result.current.fetchStatus).toBe('idle');
    act(() => {
      unmount();
    });
  });

  it('invalidates the owning product after capturing a camera image', async () => {
    mockedCaptureImageFromCamera.mockResolvedValue({
      id: 'img-1',
      url: 'https://example.com/capture.jpg',
      thumbnailUrl: null,
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

describe('useCameraLivePreview', () => {
  it('returns hlsUrl null when camera is null', () => {
    const { result, unmount } = renderHook(() => useCameraLivePreview(null), { wrapper });
    expect(result.current.hlsUrl).toBeNull();
    act(() => {
      unmount();
    });
  });

  it('returns hlsUrl null when enabled is false', () => {
    const { result, unmount } = renderHook(
      () => useCameraLivePreview({ id: 'cam-99' }, { enabled: false }),
      { wrapper },
    );
    expect(result.current.hlsUrl).toBeNull();
    act(() => {
      unmount();
    });
  });

  it('returns an hlsUrl containing the camera id when enabled', () => {
    const { result, unmount } = renderHook(() => useCameraLivePreview({ id: 'cam-99' }), {
      wrapper,
    });
    expect(result.current.hlsUrl).toContain('cam-99');
    expect(result.current.hlsUrl).toContain('index.m3u8');
    act(() => {
      unmount();
    });
  });
});
