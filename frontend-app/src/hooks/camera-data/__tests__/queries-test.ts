import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import {
  cameraListStaleTime,
  streamStatusQueryOptions,
} from '@/hooks/camera-data/queries';
import { getStreamStatus } from '@/services/api/rpiCamera';

jest.mock('@/services/api/rpiCamera', () => ({
  __esModule: true,
  fetchCameras: jest.fn(),
  fetchCamera: jest.fn(),
  fetchCameraTelemetry: jest.fn(),
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

  it('builds stream-status queries that stay idle when disabled', async () => {
    expect(streamStatusQueryOptions(null).enabled).toBe(false);
    expect(streamStatusQueryOptions('cam-9', { enabled: false }).enabled).toBe(false);

    await streamStatusQueryOptions('cam-9').queryFn?.({} as never);
    expect(getStreamStatus).toHaveBeenCalledWith('cam-9');
  });
});
