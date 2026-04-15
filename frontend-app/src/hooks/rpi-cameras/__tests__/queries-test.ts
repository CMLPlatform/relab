import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import {
  cameraListStaleTime,
  cameraSnapshotQueryOptions,
  fetchSnapshotForConnection,
  resolveSnapshotTransport,
  streamStatusQueryOptions,
} from '@/hooks/rpi-cameras/queries';
import {
  fetchCameraSnapshot,
  fetchCameraSnapshotLocally,
  getStreamStatus,
} from '@/services/api/rpiCamera';

jest.mock('@/services/api/rpiCamera', () => ({
  __esModule: true,
  fetchCameras: jest.fn(),
  fetchCamera: jest.fn(),
  fetchCameraTelemetry: jest.fn(),
  fetchCameraSnapshot: jest.fn(async () => 'relay-snapshot'),
  fetchCameraSnapshotLocally: jest.fn(async () => 'local-snapshot'),
  getStreamStatus: jest.fn(async () => null),
}));

describe('rpi camera query helpers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('computes list stale times from includeStatus/includeTelemetry', () => {
    expect(cameraListStaleTime(false, false)).toBe(60_000);
    expect(cameraListStaleTime(true, false)).toBe(15_000);
    expect(cameraListStaleTime(false, true)).toBe(5_000);
  });

  it('resolves local snapshot transport only when direct connection info is complete', () => {
    expect(
      resolveSnapshotTransport({
        mode: 'local',
        localBaseUrl: 'http://192.168.7.1:8018',
        localMediaUrl: 'http://192.168.7.1:8888',
        localApiKey: 'local-key',
      }),
    ).toEqual({
      localSnapshotBaseUrl: 'http://192.168.7.1:8018',
      localSnapshotApiKey: 'local-key',
      isLocalSnapshot: true,
    });

    expect(
      resolveSnapshotTransport({
        mode: 'relay',
        localBaseUrl: null,
        localMediaUrl: null,
        localApiKey: null,
      }),
    ).toEqual({
      localSnapshotBaseUrl: null,
      localSnapshotApiKey: null,
      isLocalSnapshot: false,
    });
  });

  it('routes snapshot fetching through the direct path when local connection info is available', async () => {
    const signal = new AbortController().signal;
    await fetchSnapshotForConnection('cam-1', signal, {
      mode: 'local',
      localBaseUrl: 'http://192.168.7.1:8018',
      localMediaUrl: 'http://192.168.7.1:8888',
      localApiKey: 'local-key',
    });

    expect(fetchCameraSnapshotLocally).toHaveBeenCalledWith(
      'http://192.168.7.1:8018',
      'local-key',
      signal,
    );
    expect(fetchCameraSnapshot).not.toHaveBeenCalled();
  });

  it('keeps the snapshot query key stable across relay and local transport', () => {
    expect(cameraSnapshotQueryOptions('cam-1').queryKey).toEqual([
      'rpiCameraSnapshot',
      'cam-1',
      'relay',
    ]);

    expect(
      cameraSnapshotQueryOptions('cam-1', {
        connectionInfo: {
          mode: 'local',
          localBaseUrl: 'http://192.168.7.1:8018',
          localMediaUrl: 'http://192.168.7.1:8888',
          localApiKey: 'local-key',
        },
      }).queryKey,
    ).toEqual(['rpiCameraSnapshot', 'cam-1', 'http://192.168.7.1:8018']);
  });

  it('builds stream-status queries that stay idle when disabled', async () => {
    expect(streamStatusQueryOptions(null).enabled).toBe(false);
    expect(streamStatusQueryOptions('cam-9', { enabled: false }).enabled).toBe(false);

    await streamStatusQueryOptions('cam-9').queryFn?.({} as never);
    expect(getStreamStatus).toHaveBeenCalledWith('cam-9');
  });
});
